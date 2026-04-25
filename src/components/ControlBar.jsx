import React, { useState, useCallback } from 'react';
import { Mic, MicOff, Square, Zap, Activity, Loader2 } from 'lucide-react';
import useRobotStore from '../store/useRobotStore';

export default function ControlBar({ onStartListening, onStopListening }) {
  const {
    speedLimit,
    setSpeedLimit,
    emergencyStop,
    rosConnected,
    isListening,
    isProcessing,
    isSpeaking,
    micAvailable,
  } = useRobotStore();

  const [isHolding, setIsHolding] = useState(false);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    if (isProcessing || isSpeaking) return;
    setIsHolding(true);
    onStartListening?.();
  }, [isProcessing, isSpeaking, onStartListening]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    if (!isHolding) return;
    setIsHolding(false);
    onStopListening?.();
  }, [isHolding, onStopListening]);

  const micState =
    isProcessing ? 'processing' :
    isSpeaking ? 'speaking' :
    isHolding || isListening ? 'listening' :
    !micAvailable ? 'unavailable' : 'idle';

  const micColors = {
    idle: 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:border-blue-500 hover:bg-zinc-700 hover:text-white',
    listening: 'bg-blue-600 border-blue-400 text-white glow-blue scale-95',
    processing: 'bg-amber-600/30 border-amber-500/60 text-amber-400',
    speaking: 'bg-purple-700/30 border-purple-500/60 text-purple-300',
    unavailable: 'bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed',
  };

  const micLabel = {
    idle: 'Hold to Speak',
    listening: 'Listening…',
    processing: 'Processing…',
    speaking: 'Speaking…',
    unavailable: 'Mic N/A',
  };

  return (
    <div className="shrink-0 flex items-center gap-4 px-5 py-3 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800">
      <div className="flex items-center gap-3 flex-1 max-w-sm">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 whitespace-nowrap select-none">
          <Activity size={12} />
          <span className="font-medium">Speed</span>
        </div>

        <div className="flex-1 relative flex items-center">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={speedLimit}
            onChange={(e) => setSpeedLimit(Number(e.target.value))}
            className={[
              'w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer',
              'transition-shadow focus:ring-2 focus:ring-blue-500/40',
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
              '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500',
              '[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-blue-400',
              '[&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing',
              '[&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.55)]',
              '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4',
              '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500',
              '[&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-blue-400',
            ].join(' ')}
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${speedLimit}%, #3f3f46 ${speedLimit}%, #3f3f46 100%)`,
            }}
          />
        </div>

        <div
          className={[
            'text-sm font-mono font-bold w-12 text-right tabular-nums',
            speedLimit > 70 ? 'text-red-400' :
            speedLimit > 40 ? 'text-yellow-400' : 'text-emerald-400',
          ].join(' ')}
        >
          {speedLimit}%
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-1 select-none">
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          disabled={micState === 'unavailable' || micState === 'processing'}
          className={[
            'relative w-16 h-16 rounded-full border-2 flex items-center justify-center',
            'font-bold transition-all duration-200 focus:outline-none touch-none',
            micColors[micState],
          ].join(' ')}
          aria-label="Hold to speak a command"
        >
          {micState === 'listening' && (
            <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-60" />
          )}
          {micState === 'processing' ? (
            <Loader2 size={22} className="animate-spin" />
          ) : micState === 'listening' ? (
            <Mic size={24} />
          ) : (
            <MicOff size={22} />
          )}
        </button>
        <span className="text-[10px] text-zinc-500 font-medium">{micLabel[micState]}</span>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-1 select-none">
        <button
          onClick={emergencyStop}
          className={[
            'relative w-16 h-16 rounded-full',
            'bg-red-600 border-2 border-red-400',
            'hover:bg-red-500 active:bg-red-700 active:scale-95',
            'flex items-center justify-center',
            'text-white font-black',
            'transition-all duration-100',
            'glow-red-strong',
            'focus:outline-none focus:ring-4 focus:ring-red-500/40',
          ].join(' ')}
          title="Emergency Stop (or press Escape)"
          aria-label="Emergency Stop"
        >
          <Square size={26} fill="white" className="drop-shadow-lg" />
        </button>
        <span className="text-[10px] text-red-400 font-bold tracking-widest uppercase">E-STOP</span>
      </div>

      <div
        className={[
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border ml-2',
          rosConnected
            ? 'bg-emerald-950/60 border-emerald-600/40 text-emerald-400'
            : 'bg-zinc-900 border-zinc-800 text-zinc-600',
        ].join(' ')}
      >
        <Zap size={11} />
        <span>{rosConnected ? 'Connected' : 'Offline'}</span>
      </div>
    </div>
  );
}
