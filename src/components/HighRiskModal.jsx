import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Flame } from 'lucide-react';
import useRobotStore from '../store/useRobotStore';

export default function HighRiskModal({ onConfirm }) {
  const {
    isHighRiskModalOpen,
    pendingCommand,
    closeHighRiskModal,
    emergencyStop,
  } = useRobotStore();

  useEffect(() => {
    if (!isHighRiskModalOpen) return;
    document.getElementById('risk-modal-cancel')?.focus();
  }, [isHighRiskModalOpen]);

  if (!isHighRiskModalOpen || !pendingCommand) return null;

  const cmd = pendingCommand;

  const handleConfirm = () => {
    closeHighRiskModal();
    onConfirm?.(cmd);
  };

  const handleCancel = () => {
    emergencyStop();
    closeHighRiskModal();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-modal-title"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={handleCancel} />

      <div className="relative z-10 w-full max-w-md bg-zinc-900 border border-red-500/40 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.25)] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-red-700 via-red-500 to-orange-500" />

        <div className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-red-950/70 border border-red-500/40 flex items-center justify-center">
              <Flame size={22} className="text-red-400" />
            </div>
            <div>
              <h2 id="risk-modal-title" className="text-lg font-bold text-white leading-tight">
                High-Risk Command Detected
              </h2>
              <p className="text-sm text-zinc-400 mt-0.5">
                The AI flagged this action as potentially dangerous. Review before proceeding.
              </p>
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 mb-5 space-y-3">
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Action Plan</p>
              <p className="text-sm text-zinc-200 leading-snug">{cmd.action_plan}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-zinc-900 rounded-lg px-3 py-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Linear X</p>
                <p className="text-base font-mono font-bold text-blue-400">
                  {(cmd.cmd_vel_values?.linear?.x ?? 0).toFixed(2)}
                  <span className="text-xs font-normal text-zinc-500 ml-1">m/s</span>
                </p>
              </div>
              <div className="bg-zinc-900 rounded-lg px-3 py-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Angular Z</p>
                <p className="text-base font-mono font-bold text-purple-400">
                  {(cmd.cmd_vel_values?.angular?.z ?? 0).toFixed(2)}
                  <span className="text-xs font-normal text-zinc-500 ml-1">rad/s</span>
                </p>
              </div>
              <div className="bg-zinc-900 rounded-lg px-3 py-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Duration</p>
                <p className="text-base font-mono font-bold text-amber-400">
                  {(cmd.duration_seconds ?? 2).toFixed(1)}
                  <span className="text-xs font-normal text-zinc-500 ml-1">s</span>
                </p>
              </div>
              <div className="bg-zinc-900 rounded-lg px-3 py-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Risk Level</p>
                <p className="text-base font-mono font-bold text-red-400 uppercase">
                  {cmd.risk_level ?? 'high'}
                </p>
              </div>
            </div>

            {cmd._originalSpeeds && (
              <div className="flex items-start gap-2 pt-1">
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-400/80">
                  Speeds clamped by Speed Limiter — original:{' '}
                  <span className="font-mono">{cmd._originalSpeeds.linear.toFixed(2)} m/s</span>
                  {' '}→ after limit:{' '}
                  <span className="font-mono">{(cmd.cmd_vel_values?.linear?.x ?? 0).toFixed(2)} m/s</span>
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              id="risk-modal-cancel"
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <XCircle size={16} className="text-red-400" />
              Cancel &amp; Stop
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 border border-red-500 text-white hover:bg-red-500 active:bg-red-700 transition-colors font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <CheckCircle2 size={16} />
              Execute Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
