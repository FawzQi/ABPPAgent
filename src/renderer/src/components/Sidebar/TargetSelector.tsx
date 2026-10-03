import React from 'react'
import { ExternalLink, Zap } from 'lucide-react'
import { useTargetStore } from '../../stores/target-store'
import { useSessionStore } from '../../stores/session-store'
import type { WebChatTargetId } from '@shared/types'

export const TargetSelector: React.FC = () => {
  const { targets, openTargetWindow } = useTargetStore()
  const { activeSession } = useSessionStore()

  const handleSelectTarget = async (id: WebChatTargetId) => {
    if (activeSession && window.agentApi) {
      await window.agentApi.updateSessionSettings(activeSession.id, { targetId: id })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'working':
        return <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Generating response..." />
      case 'paused':
        return <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" title="Paused (waiting for continue)" />
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-red-500" title="Error" />
      default:
        return <span className="w-2 h-2 rounded-full bg-emerald-500/80" title="Idle / Ready" />
    }
  }

  return (
    <div className="flex flex-col border-b border-slate-800 p-2">
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
              className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition ${
                isSelected
                  ? 'bg-slate-800 border border-slate-700 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {getStatusBadge(target.status ?? 'idle')}
                <span>{target.label}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openTargetWindow(target.id)
                }}
                className="text-slate-500 hover:text-indigo-400 p-1 rounded transition"
                title={`Open ${target.label} browser tab`}
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
