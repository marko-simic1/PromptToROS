import React, { useRef, useEffect } from 'react';
import Header from './components/Header';
import VideoFeed from './components/VideoFeed';
import ChatLog from './components/ChatLog';
import CanvasMap from './components/CanvasMap';
import ControlBar from './components/ControlBar';
import HighRiskModal from './components/HighRiskModal';
import { useAIBrain } from './hooks/useAIBrain';
import useRobotStore from './store/useRobotStore';

function TelemetryItem({ label, value, color = 'text-zinc-200' }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-lg px-3 py-2">
      <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-0.5 truncate">
        {label}
      </p>
      <p className={`text-sm font-mono font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function TelemetryPanel() {
  const { position, orientation, velocity, battery, speedLimit, noGoZones } = useRobotStore();

  const yawDeg = ((orientation.yaw * 180) / Math.PI).toFixed(1);
  const batColor =
    battery === null ? 'text-zinc-500' :
    battery > 60 ? 'text-emerald-400' :
    battery > 25 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="grid grid-cols-4 gap-2 p-2">
      <TelemetryItem label="X Position" value={`${position.x.toFixed(3)} m`} color="text-blue-400" />
      <TelemetryItem label="Y Position" value={`${position.y.toFixed(3)} m`} color="text-blue-400" />
      <TelemetryItem label="Yaw" value={`${yawDeg}°`} color="text-purple-400" />
      <TelemetryItem label="Battery" value={battery !== null ? `${battery}%` : '—'} color={batColor} />
      <TelemetryItem label="Linear Vel." value={`${velocity.linear.toFixed(2)} m/s`} color="text-cyan-400" />
      <TelemetryItem label="Angular Vel." value={`${velocity.angular.toFixed(2)} r/s`} color="text-cyan-400" />
      <TelemetryItem
        label="Speed Limit"
        value={`${speedLimit}%`}
        color={speedLimit > 70 ? 'text-red-400' : speedLimit > 40 ? 'text-yellow-400' : 'text-emerald-400'}
      />
      <TelemetryItem
        label="No-Go Zones"
        value={String(noGoZones.length)}
        color={noGoZones.length > 0 ? 'text-red-400' : 'text-zinc-500'}
      />
    </div>
  );
}

export default function App() {
  const videoRef = useRef(null);

  const { initROS, emergencyStop } = useRobotStore();
  const { startListening, stopListening, executeCommand: execCmd } = useAIBrain(videoRef);

  useEffect(() => {
    initROS();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') emergencyStop();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [emergencyStop]);

  return (
    <div className="h-screen bg-zinc-950 text-white flex flex-col overflow-hidden select-none">
      <Header />

      <main className="flex-1 flex gap-2 p-2 overflow-hidden min-h-0">
        <div className="flex flex-col gap-2 w-[40%] min-h-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden" style={{ flex: '3 1 0' }}>
            <VideoFeed ref={videoRef} />
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden" style={{ flex: '2 1 0' }}>
            <ChatLog />
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden" style={{ flex: '5 1 0' }}>
            <CanvasMap />
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
            <TelemetryPanel />
          </div>
        </div>
      </main>

      <ControlBar onStartListening={startListening} onStopListening={stopListening} />
      <HighRiskModal onConfirm={(command) => execCmd(command)} />
    </div>
  );
}
