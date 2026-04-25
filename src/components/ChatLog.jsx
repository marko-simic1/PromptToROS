import React, { useRef, useEffect } from 'react';
import { Bot, User, AlertTriangle, Info, Trash2 } from 'lucide-react';
import useRobotStore from '../store/useRobotStore';

const ROLE_META = {
  user: {
    icon: User,
    bubbleClass: 'bg-blue-600/15 border-blue-500/25 text-blue-100 rounded-tr-none',
    iconBg: 'bg-blue-600',
    align: 'flex-row-reverse',
    label: 'Operator',
  },
  assistant: {
    icon: Bot,
    bubbleClass: 'bg-zinc-800/80 border-zinc-700/60 text-zinc-200 rounded-tl-none',
    iconBg: 'bg-zinc-700',
    align: 'flex-row',
    label: 'AI Brain',
  },
  system: {
    icon: Info,
    bubbleClass: 'bg-amber-950/30 border-amber-700/30 text-amber-300 w-full text-center',
    iconBg: 'bg-amber-700/40',
    align: 'flex-row',
    label: 'System',
  },
};

function MessageBubble({ message }) {
  const { role, content, timestamp } = message;
  const meta = ROLE_META[role] ?? ROLE_META.system;
  const Icon = meta.icon;

  if (role === 'system') {
    return (
      <div className="flex items-start gap-2 py-0.5">
        <div className={`flex-shrink-0 w-5 h-5 rounded-full ${meta.iconBg} flex items-center justify-center`}>
          <Icon size={10} className="text-amber-300" />
        </div>
        <p className="text-xs text-amber-300/80 leading-snug pt-0.5">{content}</p>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${meta.align}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full ${meta.iconBg} flex items-center justify-center mt-0.5`}
      >
        <Icon size={13} className="text-white" />
      </div>
      {/* Bubble */}
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl border text-sm leading-relaxed ${meta.bubbleClass}`}
      >
        <p className="text-[11px] font-semibold opacity-60 mb-1">{meta.label}</p>
        <p className="whitespace-pre-wrap">{content}</p>
        <time className="block text-[10px] opacity-40 mt-1.5">
          {timestamp.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      </div>
    </div>
  );
}

export default function ChatLog() {
  const { messages, clearMessages } = useRobotStore();
  const endRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={13} className="text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Task Log
          </span>
          {messages.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 font-mono">
              {messages.length}
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
            title="Clear log"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pb-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
              <Bot size={20} className="text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-500 font-medium">No commands yet</p>
            <p className="text-xs text-zinc-700 mt-1">Hold the mic button and speak in Croatian</p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
