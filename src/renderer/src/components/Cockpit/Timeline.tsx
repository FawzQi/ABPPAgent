import React, { useEffect, useRef } from 'react'
import { User, Bot, Sparkles, CheckCircle2 } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'
import { ThinkingCard } from './ThinkingCard'
import { ToolCard } from './ToolCard'

export const Timeline: React.FC = () => {
  const { timeline, activeSession } = useSessionStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [timeline])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto text-slate-400">
          <div className="w-12 h-12 rounded-xl bg-sky-950/60 border border-sky-800/50 flex items-center justify-center text-sky-400 mb-3 shadow-lg">
            <Sparkles size={24} />
          </div>
          <h2 className="text-sm font-semibold text-slate-200 mb-1">OpenCode Autonomous Agent Ready</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            Powered by your web chat subscription with zero API costs. The agent executes terminal commands, reads
            and writes code, and solves engineering tasks directly in your workspace.
          </p>
          <div className="grid grid-cols-1 gap-2 w-full text-left">
            <div className="p-2.5 rounded bg-[#1e2127] border border-[#2c3038] text-xs text-slate-300">
              <span className="font-semibold text-slate-200">Prompt:</span> "Inspect why tests are failing and fix them"
            </div>
            <div className="p-2.5 rounded bg-[#1e2127] border border-[#2c3038] text-xs text-slate-300">
              <span className="font-semibold text-slate-200">Prompt:</span> "Review project structure and implement missing endpoints"
            </div>
          </div>
        </div>
      ) : (
        timeline.map((item) => {
          if (item.role === 'user') {
            return (
              <div key={item.id} className="flex gap-3 items-start justify-end">
                <div className="bg-sky-600 text-white rounded-lg px-3.5 py-2 text-xs max-w-2xl leading-relaxed shadow-sm">
                  {item.content}
                </div>
                <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <User size={14} />
                </div>
              </div>
            )
          }

          if (item.role === 'tool') {
            return <ToolCard key={item.id} item={item} />
          }

          // Assistant message
          const isFinished = item.isFinish || item.toolCall?.name === 'finish'
          return (
            <div key={item.id} className="flex gap-3 items-start">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  isFinished
                    ? 'bg-emerald-950/80 border border-emerald-500 text-emerald-400 shadow-sm shadow-emerald-950'
                    : 'bg-[#1e2127] border border-[#2c3038] text-sky-400'
                }`}
              >
                {isFinished ? <CheckCircle2 size={15} /> : <Bot size={14} />}
              </div>

              <div className="flex-1 max-w-3xl space-y-1">
                {item.thinking && <ThinkingCard thinking={item.thinking} />}

                {item.content && (
                  <div
                    className={`rounded-lg p-3 text-xs leading-relaxed select-text whitespace-pre-wrap transition-all duration-200 ${
                      isFinished
                        ? 'border-2 border-emerald-500 bg-emerald-950/25 text-emerald-100 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30'
                        : 'bg-[#1e2127] border border-[#2c3038] text-[#e6e8eb]'
                    }`}
                  >
                    {isFinished && (
                      <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-emerald-500/30 text-emerald-400 font-semibold text-[11px] tracking-wide uppercase">
                        <CheckCircle2 size={13} className="text-emerald-400" />
                        <span>Task Finished</span>
                      </div>
                    )}
                    {item.content}
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
