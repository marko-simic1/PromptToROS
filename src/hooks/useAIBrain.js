import { useRef, useEffect, useCallback } from 'react';
import useRobotStore from '../store/useRobotStore';

const SYSTEM_PROMPT = `You are an AI controller for a ROS mobile robot operating in a real environment.
Your job is to analyse the camera image and the operator's voice command, then generate a precise motion plan.

Respond ONLY with valid JSON matching this schema exactly:
{
  "action_plan": "Short description of what the robot will do (respond in the same language as the user's command)",
  "cmd_vel_values": {
    "linear":  { "x": 0.0, "y": 0.0, "z": 0.0 },
    "angular": { "x": 0.0, "y": 0.0, "z": 0.0 }
  },
  "duration_seconds": 2.0,
  "risk_level": "low"
}

Rules:
- risk_level must be one of: "low", "medium", "high"
- Use "high" if the command could cause collision, fall, or equipment damage
- linear.x: forward positive (max ±1.0 m/s), linear.y always 0
- angular.z: counter-clockwise positive (max ±1.5 rad/s)
- duration_seconds: how long to apply the command (0.5 – 10.0 s)
- If the command is ambiguous or dangerous, set all velocities to 0 and explain in action_plan`;

export function useAIBrain(videoRef) {
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const isHoldingRef = useRef(false);

  const {
    env,
    speedLimit,
    rosConnected,
    addMessage,
    publishCmdVel,
    openHighRiskModal,
    setListening,
    setProcessing,
    setSpeaking,
    setMicAvailable,
    setLLMConnected,
    setPendingCommand,
  } = useRobotStore();

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn('[Speech] Web Speech API not supported in this browser');
      setMicAvailable(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = 'hr-HR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += event.results[i][0].transcript + ' ';
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('[Speech] Recognition error:', event.error);
      if (event.error !== 'aborted') {
        setListening(false);
        isHoldingRef.current = false;
      }
    };

    recognition.onend = () => {
      if (isHoldingRef.current) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognitionRef.current = recognition;
    setMicAvailable(true);

    return () => { try { recognition.abort(); } catch (_) {} };
  }, []);

  useEffect(() => {
    setLLMConnected(Boolean(env.GEMINI_API_KEY));
  }, [env.GEMINI_API_KEY]);

  const captureFrame = useCallback(async () => {
    const img = videoRef?.current;
    if (!img) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
    } catch (err) {
      console.warn('[Vision] Frame capture failed (CORS?):', err.message);
      return null;
    }
  }, [videoRef]);

  const speakText = useCallback((text) => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      setSpeaking(true);
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'hr-HR';
      utt.rate = 1.05;
      utt.pitch = 1.0;
      utt.onend = () => { setSpeaking(false); resolve(); };
      utt.onerror = () => { setSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utt);
    });
  }, [setSpeaking]);

  const callGemini = useCallback(async (text, imageBase64) => {
    const { GEMINI_API_KEY, AI_MODEL } = env;
    if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY not set in .env');

    const parts = [{ text }];
    if (imageBase64) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `Gemini API error ${res.status}`);
    }

    const data = await res.json();
    const parsed = JSON.parse(data.candidates[0].content.parts[0].text);

    parsed.duration_seconds ??= 2.0;
    parsed.risk_level ??= 'medium';
    parsed.cmd_vel_values ??= { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };

    return parsed;
  }, [env]);

  const applySafetyLayer = useCallback((aiResponse) => {
    const factor = speedLimit / 100;
    const cv = aiResponse.cmd_vel_values;

    return {
      ...aiResponse,
      cmd_vel_values: {
        linear: { x: (cv.linear?.x ?? 0) * factor, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: (cv.angular?.z ?? 0) * factor },
      },
      _originalSpeeds: {
        linear: cv.linear?.x ?? 0,
        angular: cv.angular?.z ?? 0,
      },
      requiresConfirmation: aiResponse.risk_level === 'high',
    };
  }, [speedLimit]);

  const executeCommand = useCallback(async (safeCommand) => {
    const { cmd_vel_values, action_plan, duration_seconds = 2.0 } = safeCommand;
    const durationMs = Math.max(500, Math.min(duration_seconds * 1000, 10000));

    await speakText(action_plan);

    if (rosConnected) {
      publishCmdVel(cmd_vel_values.linear.x, cmd_vel_values.angular.z);

      const stopTimeoutId = setTimeout(() => {
        publishCmdVel(0, 0);
        setPendingCommand(null);
      }, durationMs);

      setPendingCommand({ ...safeCommand, stopTimeoutId });
    } else {
      addMessage('system', 'Not connected to ROS — command NOT sent');
    }
  }, [speakText, publishCmdVel, rosConnected, addMessage, setPendingCommand]);

  const processVoiceCommand = useCallback(async (transcript) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;

    setProcessing(true);
    addMessage('user', trimmed);

    try {
      const imageBase64 = await captureFrame();
      const aiResponse = await callGemini(trimmed, imageBase64);
      const safeCommand = applySafetyLayer(aiResponse);

      addMessage('assistant', safeCommand.action_plan);

      if (safeCommand.requiresConfirmation) {
        openHighRiskModal(safeCommand);
      } else {
        await executeCommand(safeCommand);
      }
    } catch (err) {
      console.error('[AIBrain] Processing error:', err);
      addMessage('system', `Error: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [captureFrame, callGemini, applySafetyLayer, executeCommand, addMessage, openHighRiskModal, setProcessing]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      addMessage('system', 'Microphone not available in this browser');
      return;
    }
    finalTranscriptRef.current = '';
    isHoldingRef.current = true;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (err) {
      console.error('[Speech] start() failed:', err);
    }
  }, [setListening, addMessage]);

  const stopListening = useCallback(() => {
    isHoldingRef.current = false;
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch (_) {}
    setListening(false);

    setTimeout(() => {
      const transcript = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = '';
      if (transcript) processVoiceCommand(transcript);
    }, 400);
  }, [setListening, processVoiceCommand]);

  return { startListening, stopListening, executeCommand, speakText };
}
