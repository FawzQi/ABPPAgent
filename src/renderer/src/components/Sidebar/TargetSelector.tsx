import React from 'react'
import { ExternalLink, Zap, Check } from 'lucide-react'
import { useTargetStore } from '../../stores/target-store'
import { useSessionStore } from '../../stores/session-store'
import type { WebChatTargetId } from '@shared/types'

export const TargetSelector: React.FC = () => {
  const { targets, openTargetWindow } = useTargetStore()
  const { activeSession, setTargetId } = useSessionStore()

  const handleSelectTarget = async (id: WebChatTargetId) => {
    if (activeSession) {
      await setTargetId(id)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'working':
        return <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" title="Generating response..." />
      case 'paused':
        return <span className="w-2 h-2 rounded-full bg-amber-400" title="Paused (waiting for continue)" />
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-red-400" title="Error" />
      default:
        return <span className="w-2 h-2 rounded-full bg-slate-600" title="Idle / Ready" />
    }
  }

  return (
    <div className="flex flex-col border-b border-[#2c3038] p-2">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Web Chat Models</span>
        <Zap size={13} className="text-amber-400" />
      </div>

      <div className="space-y-1">
        {targets.map((target) => {
          const isSelected = activeSession?.targetId === target.id
          return (
            <div
              key={target.id}
              onClick={() => handleSelectTarget(target.id)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition select-none ${
                isSelected
                  ? 'bg-[#1e2127] border border-[#2c3038] text-white font-medium shadow-xs'
                  : 'text-slate-400 hover:bg-[#1e2127] hover:text-slate-200 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                {getStatusBadge(target.status ?? 'idle')}
                <span className={isSelected ? 'text-sky-300 font-semibold' : ''}>{target.label}</span>
                {isSelected && (
                  <span className="flex items-center gap-0.5 text-[10px] bg-sky-950/80 text-sky-400 border border-sky-800/60 px-1.5 py-0.2 rounded font-mono">
                    <Check size={10} /> Active
                  </span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openTargetWindow(target.id)
                }}
                className="text-slate-500 hover:text-sky-400 p-1 rounded transition cursor-pointer hover:bg-[#2a2f38]"
                title={`Open / Log in to ${target.label} tab`}
              >
                <ExternalLink size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
