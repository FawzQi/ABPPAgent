import React, { useEffect, useRef } from 'react'
import { Terminal, XCircle, CheckCircle, Clock } from 'lucide-react'

interface TerminalWidgetProps {
  command: string
  output?: string
  exitCode?: number
  isError?: boolean
  isRunning?: boolean
  onKill?: () => void
}

export const TerminalWidget: React.FC<TerminalWidgetProps> = ({
  command,
  output,
  exitCode,
  isError,
  isRunning,
  onKill,
}) => {
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // Simple ANSI strip helper for clean readability
  const cleanAnsi = (text: string) => {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-900/90 font-mono text-xs overflow-hidden my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2 truncate">
          <Terminal size={13} className="text-slate-400 shrink-0" />
          <span className="text-emerald-400 font-semibold">$</span>
          <span className="text-slate-200 truncate">{command}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-blue-400">
                <Clock size={12} className="animate-spin" />
                <span>Running</span>
              </span>
              {onKill && (
                <button
                  onClick={onKill}
                  className="bg-red-950/80 hover:bg-red-900 text-red-300 px-1.5 py-0.5 rounded text-[10px] transition cursor-pointer"
                >
                  Kill
                </button>
              )}
            </div>
          ) : exitCode !== undefined ? (
            <span
              className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium ${
                isError || exitCode !== 0
                  ? 'bg-red-950/80 text-red-400 border border-red-900/60'
                  : 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/60'
              }`}
            >
              {isError || exitCode !== 0 ? <XCircle size={11} /> : <CheckCircle size={11} />}
              <span>Exit {exitCode}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div
        ref={outputRef}
        className="p-3 text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed select-text"
      >
        {output ? cleanAnsi(output) : <span className="text-slate-600 italic">Waiting for terminal output...</span>}
      </div>
    </div>
  )
}
