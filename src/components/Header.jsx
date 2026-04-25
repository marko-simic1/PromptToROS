import React from 'react';
import { Cpu, Activity, Brain, Mic, Camera } from 'lucide-react';
import useRobotStore from '../store/useRobotStore';

function StatusBadge({ label, connected, icon: Icon }) {
  return (
    <div
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border',
        'transition-all duration-500',
        connected
          ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-400 glow-green'
          : 'bg-red-950/50 border-red-800/50 text-red-500 glow-red',
      ].join(' ')}
    >
      <Icon size={11} strokeWidth={2.5} />
      <span className="tracking-wide">{label}</span>
      <span
        className={[
          'w-1.5 h-1.5 rounded-full',
          connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500',
        ].join(' ')}
      />
    </div>
  );
}

function BatteryChip({ level }) {
  const color =
    level === null ? 'text-zinc-500' :
    level > 60 ? 'text-emerald-400' :
    level > 25 ? 'text-yellow-400' : 'text-red-400';

  const fill =
    level === null ? 0 :
    level > 60 ? 3 :
    level > 40 ? 2 :
    level > 15 ? 1 : 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-xs">
      <svg width="20" height="11" viewBox="0 0 20 11" fill="none" className={color}>
        <rect x="0.5" y="0.5" width="17" height="10" rx="2" stroke="currentColor" strokeWidth="1" />
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={2 + i * 3.75}
            y={2}
            width={2.75}
            height={7}
            rx={0.5}
            fill={i < fill ? 'currentColor' : 'none'}
            stroke={i < fill ? 'none' : 'currentColor'}
            strokeWidth="0.6"
            opacity={i < fill ? 1 : 0.3}
          />
        ))}
        <rect x="18" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.6" />
      </svg>
      <span className={`font-mono font-semibold ${color}`}>
        {level !== null ? `${level}%` : '—'}
      </span>
    </div>
  );
}

export default function Header() {
  const { env, rosConnected, llmConnected, micAvailable, cameraAvailable, battery } = useRobotStore();

  return (
    <header className="relative flex items-center justify-between px-5 py-2.5 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 z-50 shrink-0">
      <div className="flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-[0_0_14px_rgba(59,130,246,0.45)]">
          <Cpu size={18} className="text-white" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-zinc-900" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight leading-none">OmniROS Controller</h1>
          <p className="text-[10px] text-zinc-500 font-mono mt-0.5 leading-none">{env.ROSBRIDGE_URL}</p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-1 opacity-40">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="w-px h-3 bg-zinc-500" style={{ opacity: 1 - i * 0.07 }} />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <StatusBadge label="ROS" connected={rosConnected} icon={Activity} />
        <StatusBadge label="LLM" connected={llmConnected} icon={Brain} />
        <StatusBadge label="Mic" connected={micAvailable} icon={Mic} />
        <StatusBadge label="Camera" connected={cameraAvailable} icon={Camera} />
        <div className="w-px h-5 bg-zinc-700 mx-1" />
        <BatteryChip level={battery} />
      </div>
    </header>
  );
}
