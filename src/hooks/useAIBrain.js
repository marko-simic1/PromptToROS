import { useRef, useEffect, useCallback } from 'react';
import useRobotStore from '../store/useRobotStore';

const BASE_PROMPT = `You are an AI controller for a ROS mobile robot operating in a real environment.
Your job is to analyse the camera image and the operator's voice command, then generate a precise motion plan.

Respond ONLY with valid JSON matching this schema exactly:
{
  "action_plan": "Short description of what the robot will do (always respond in English)",
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
- duration_seconds: how long to apply the command (0.5 – 25.0 s) — MUST be long enough for the full motion
- For distance commands: duration_seconds = distance_m / |linear.x| (e.g. 1 m at 0.3 m/s → 3.3 s)
- For rotation: duration_seconds = angle_radians / |angular.z| (180° = 3.14 rad; at 0.7 rad/s → at least 4.5 s; 90° at 0.7 rad/s → at least 2.3 s)
- Prefer |angular.z| between 0.5 and 1.0 rad/s for rotations (not tiny values like 0.1)
- If the operator asks a question about the environment or what the robot sees, set all velocities to 0 and provide a detailed description of the scene in action_plan
- If risk_level is "high": the operator must confirm in the app before motion runs. action_plan MUST describe the intended motion (direction, speed, duration). NEVER write that the robot will not move, refused, blocked, cancelled, or cannot execute — motion is pending approval, not denied
- Only set all velocities to 0 when the operator asked a question or gave a non-motion command`;

function buildSystemPrompt(noGoZones, position) {
  let prompt = BASE_PROMPT;

  if (position) {
    prompt += `\n\nCurrent robot position: x=${position.x.toFixed(2)} m, y=${position.y.toFixed(2)} m`;
  }

  if (noGoZones && noGoZones.length > 0) {
    prompt += `\n\nForbidden no-go zones (operator-defined restricted areas):`;
    noGoZones.forEach((z, i) => {
      prompt += `\n- Zone ${i + 1}: x from ${z.x1.toFixed(2)} to ${z.x2.toFixed(2)} m, y from ${z.y1.toFixed(2)} to ${z.y2.toFixed(2)} m`;
    });
    prompt += `\n\nNo-go zone rules (STRICT):`;
    prompt += `\n- If the command would move the robot INTO a no-go zone: keep the planned velocities but set risk_level to "high" and warn in action_plan. The operator will confirm.`;
    prompt += `\n- If the robot is currently INSIDE a no-go zone: set risk_level to "high" for any movement command. The operator must confirm.`;
    prompt += `\n- NEVER set velocities to 0 just because of a no-go zone — always preserve the intended motion so the operator can confirm or cancel.`;
    prompt += `\n- For no-go zone warnings: action_plan says what the robot WILL do if approved (e.g. "Will drive forward 0.3 m/s for 3 s toward the zone — confirm to proceed"), not that movement is refused.`;
  }

  return prompt;
}

const MAX_DURATION_S = 25;
const MIN_ROTATION_SPEED = 0.5;
const MIN_LINEAR_SPEED = 0.15;
const DURATION_MARGIN = 1.15;

function parseTargetDegrees(transcript) {
  const t = transcript.toLowerCase();
  if (/pola\s+(?:okreta|kruga)|\b180\b|sto\s*osamdeset/.test(t)) return 180;
  if (/(?:četvrt|cetvrt)\s+kruga|\b90\b|devedeset/.test(t)) return 90;
  if (/pun\s+krug|\b360\b/.test(t)) return 360;
  const m =
    t.match(/(\d+(?:[.,]\d+)?)\s*(?:stupnj\w*|degrees?|deg\b|°)/) ||
    t.match(/(?:rotate|rotiraj|okret|okreni).*?(\d+(?:[.,]\d+)?)/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return null;
}

function parseTargetMeters(transcript) {
  const t = transcript.toLowerCase();
  const m =
    t.match(/(\d+(?:[.,]\d+)?)\s*(?:metar\w*|metre|meters?)\b/) ||
    t.match(/(\d+(?:[.,]\d+)?)\s*m\b/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return null;
}

function adjustMotionFromTranscript(transcript, command) {
  const cv = command.cmd_vel_values ?? {};
  let linearX = cv.linear?.x ?? 0;
  let angularZ = cv.angular?.z ?? 0;
  let duration = command.duration_seconds ?? 2;

  const degrees = parseTargetDegrees(transcript);
  if (degrees != null && Math.abs(angularZ) > 0.02) {
    const sign = Math.sign(angularZ) || 1;
    const speed = Math.max(Math.abs(angularZ), MIN_ROTATION_SPEED);
    angularZ = sign * speed;
    const radians = (degrees * Math.PI) / 180;
    duration = Math.max(duration, (radians / speed) * DURATION_MARGIN);
  }

  const meters = parseTargetMeters(transcript);
  if (meters != null && Math.abs(linearX) > 0.02) {
    const sign = Math.sign(linearX) || 1;
    const speed = Math.max(Math.abs(linearX), MIN_LINEAR_SPEED);
    linearX = sign * speed;
    duration = Math.max(duration, (meters / speed) * DURATION_MARGIN);
  }

  duration = Math.max(0.5, Math.min(duration, MAX_DURATION_S));

  return {
    ...command,
    duration_seconds: duration,
    cmd_vel_values: {
      linear: { x: linearX, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angularZ },
    },
  };
}

export function useAIBrain(videoRef) {
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const isHoldingRef = useRef(false);
  const awaitingStopRef = useRef(false);
  const processVoiceCommandRef = useRef(null);

  const {
    env,
    speedLimit,
    position,
    noGoZones,
    addMessage,
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
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const flushTranscriptToProcessing = () => {
      const transcript = (
        finalTranscriptRef.current + interimTranscriptRef.current
      ).trim();
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      if (transcript) {
        processVoiceCommandRef.current?.(transcript);
      } else {
        useRobotStore.getState().addMessage('system', 'No speech detected — try again');
      }
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += text + ' ';
          interimTranscriptRef.current = '';
        } else {
          interimTranscriptRef.current = text;
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('[Speech] Recognition error:', event.error);
      if (event.error === 'aborted') return;
      awaitingStopRef.current = false;
      setListening(false);
      isHoldingRef.current = false;
      if (event.error === 'no-speech') {
        useRobotStore.getState().addMessage('system', 'No speech detected — try again');
      }
    };

    recognition.onend = () => {
      if (isHoldingRef.current) {
        try { recognition.start(); } catch (_) {}
        return;
      }
      if (awaitingStopRef.current) {
        awaitingStopRef.current = false;
        setTimeout(flushTranscriptToProcessing, 200);
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

    const systemPrompt = buildSystemPrompt(noGoZones, position);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
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
  }, [env, noGoZones, position]);

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

  const executeMotion = useCallback((safeCommand) => {
    const { cmd_vel_values } = safeCommand;
    const linearX = Number(cmd_vel_values?.linear?.x ?? 0);
    const angularZ = Number(cmd_vel_values?.angular?.z ?? 0);
    const durationSec = Number(safeCommand.duration_seconds ?? 2);
    const durationMs = Math.max(
      500,
      Math.min((Number.isFinite(durationSec) ? durationSec : 2) * 1000, MAX_DURATION_S * 1000),
    );

    useRobotStore.getState().cancelActiveMotion();

    const { rosConnected, cmdVelTopic, publishCmdVel: pubVel } = useRobotStore.getState();

    if (Math.abs(linearX) < 0.001 && Math.abs(angularZ) < 0.001) {
      addMessage('system', 'Command has zero velocity — robot will not move');
      return false;
    }

    if (!rosConnected || !cmdVelTopic) {
      addMessage('system', 'Not connected to ROS — command NOT sent');
      return false;
    }

    const CMD_VEL_RATE_MS = 100;
    pubVel(linearX, angularZ);
    const cmdVelIntervalId = setInterval(() => {
      useRobotStore.getState().publishCmdVel(linearX, angularZ);
    }, CMD_VEL_RATE_MS);

    const stopTimeoutId = setTimeout(() => {
      clearInterval(cmdVelIntervalId);
      useRobotStore.getState().publishCmdVel(0, 0);
      setPendingCommand(null);
    }, durationMs);

    setPendingCommand({ ...safeCommand, stopTimeoutId, cmdVelIntervalId });
    addMessage(
      'system',
      `Executing: linear ${linearX.toFixed(2)} m/s, angular ${angularZ.toFixed(2)} rad/s for ${(durationMs / 1000).toFixed(1)} s`,
    );
    console.log('[Motion]', { linearX, angularZ, durationMs, topic: useRobotStore.getState().env?.CMD_VEL_TOPIC });
    return true;
  }, [addMessage, setPendingCommand]);

  const processVoiceCommand = useCallback(async (transcript) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;

    setProcessing(true);
    addMessage('user', trimmed);

    try {
      const imageBase64 = await captureFrame();
      const aiResponse = await callGemini(trimmed, imageBase64);
      const safeCommand = adjustMotionFromTranscript(
        trimmed,
        applySafetyLayer(aiResponse),
      );

      addMessage('assistant', safeCommand.action_plan);
      await speakText(safeCommand.action_plan);

      if (safeCommand.requiresConfirmation) {
        const linearX = safeCommand.cmd_vel_values?.linear?.x ?? 0;
        const angularZ = safeCommand.cmd_vel_values?.angular?.z ?? 0;
        const hasMotion = Math.abs(linearX) >= 0.001 || Math.abs(angularZ) >= 0.001;

        if (hasMotion) {
          addMessage(
            'system',
            'High-risk command — review the dialog and tap Execute Anyway to run.',
          );
        } else {
          addMessage(
            'system',
            'High-risk flagged but no motion values were planned. Rephrase the command or try again.',
          );
        }
        openHighRiskModal(safeCommand);
      } else {
        executeMotion(safeCommand);
      }
    } catch (err) {
      console.error('[AIBrain] Processing error:', err);
      addMessage('system', `Error: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [captureFrame, callGemini, applySafetyLayer, executeMotion, speakText, addMessage, openHighRiskModal, setProcessing]);

  useEffect(() => {
    processVoiceCommandRef.current = processVoiceCommand;
  }, [processVoiceCommand]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      addMessage('system', 'Microphone not available in this browser');
      return;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
    awaitingStopRef.current = false;
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    isHoldingRef.current = true;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (err) {
      console.error('[Speech] start() failed:', err);
      isHoldingRef.current = false;
    }
  }, [setListening, setSpeaking, addMessage]);

  const stopListening = useCallback(() => {
    if (!isHoldingRef.current && !useRobotStore.getState().isListening) return;
    isHoldingRef.current = false;
    if (!recognitionRef.current) return;
    awaitingStopRef.current = true;
    setListening(false);
    try {
      recognitionRef.current.stop();
    } catch (_) {
      awaitingStopRef.current = false;
    }

    setTimeout(() => {
      if (!awaitingStopRef.current) return;
      awaitingStopRef.current = false;
      const transcript = (
        finalTranscriptRef.current + interimTranscriptRef.current
      ).trim();
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      if (transcript) {
        processVoiceCommandRef.current?.(transcript);
      } else {
        addMessage('system', 'No speech detected — try again');
      }
    }, 1200);
  }, [setListening, addMessage]);

  return { startListening, stopListening, executeCommand: executeMotion, speakText };
}
