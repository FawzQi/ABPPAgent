import React, { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import type { ThinkingBlock } from '@shared/types'

interface ThinkingCardProps {
  thinking: ThinkingBlock
}

export const ThinkingCard: React.FC<ThinkingCardProps> = ({ thinking }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="rounded border border-[#2c3038] bg-[#1e2127] my-2 overflow-hidden text-xs">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-[#16181d] hover:bg-[#2a2f38] text-sky-300 font-medium transition cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5">
          <Brain size={13} className="text-sky-400" />
          <span>Thought Process</span>
          <span className="text-slate-400 font-normal">
            ({thinking.content.length} chars)
          </span>
        </div>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {isExpanded && (
        <div className="p-3 text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-[#2c3038] bg-[#16181d]">
          {thinking.content}
        </div>
      )}
    </div>
  )
}
