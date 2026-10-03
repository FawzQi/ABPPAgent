import React, { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import type { ThinkingBlock } from '@shared/types'

interface ThinkingCardProps {
  thinking: ThinkingBlock
}

export const ThinkingCard: React.FC<ThinkingCardProps> = ({ thinking }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="rounded border border-indigo-900/40 bg-indigo-950/20 my-2 overflow-hidden text-xs">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-indigo-950/40 hover:bg-indigo-950/60 text-indigo-300 font-medium transition cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5">
          <Brain size={13} className="text-indigo-400" />
          <span>Thought Process</span>
          <span className="text-indigo-400/60 font-normal">
            ({thinking.content.length} chars)
          </span>
        </div>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {isExpanded && (
        <div className="p-3 text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-indigo-900/30 bg-slate-950/60">
          {thinking.content}
        </div>
      )}
    </div>
  )
}
