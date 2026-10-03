import React, { useEffect, useRef } from 'react'
import { User, Bot, Sparkles } from 'lucide-react'
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
          <div className="w-12 h-12 rounded-xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400 mb-3 shadow-lg">
            <Sparkles size={24} />
          </div>
          <h2 className="text-sm font-semibold text-slate-200 mb-1">OpenCode Autonomous Agent Ready</h2>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            Powered by your web chat subscription with zero API costs. The agent executes terminal commands, reads
            and writes code, and solves engineering tasks directly in your workspace.
          </p>
          <div className="grid grid-cols-1 gap-2 w-full text-left">
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Prompt:</span> "Inspect why tests are failing and fix them"
            </div>
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Prompt:</span> "Review project structure and implement missing endpoints"
            </div>
          </div>
        </div>
      ) : (
        timeline.map((item) => {
          if (item.role === 'user') {
            return (
              <div key={item.id} className="flex gap-3 items-start justify-end">
                <div className="bg-indigo-600/90 text-white rounded-lg px-3.5 py-2 text-xs max-w-2xl leading-relaxed shadow-sm">
                  {item.content}
                </div>
                <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <User size={14} />
                </div>
              </div>
            )
          }

          if (item.role === 'tool') {
            return <ToolCard key={item.id} item={item} />
          }

          // Assistant message
          return (
            <div key={item.id} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                <Bot size={14} />
              </div>

              <div className="flex-1 max-w-3xl space-y-1">
                {item.thinking && <ThinkingCard thinking={item.thinking} />}

                {item.content && (
                  <div className="bg-slate-900/70 border border-slate-800/80 rounded-lg p-3 text-xs text-slate-200 leading-relaxed select-text whitespace-pre-wrap">
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
