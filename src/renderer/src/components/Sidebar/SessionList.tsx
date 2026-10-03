import React from 'react'
import { Plus, MessageSquare, Trash2 } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'

export const SessionList: React.FC = () => {
  const { sessions, activeSession, createSession, selectSession, deleteSession } = useSessionStore()

  return (
    <div className="flex flex-col flex-1 min-h-0 border-b border-slate-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sessions</span>
        <button
          onClick={() => createSession()}
          className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded transition cursor-pointer"
          title="Create New Session"
        >
          <Plus size={13} />
          <span>New</span>
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {sessions.length === 0 ? (
          <div className="text-xs text-slate-500 px-2 py-4 text-center">No active sessions</div>
        ) : (
          sessions.map((session) => {
            const isActive = activeSession?.id === session.id
            return (
              <div
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition ${
                  isActive
                    ? 'bg-slate-800 text-indigo-400 font-medium border border-slate-700/60'
                    : 'text-slate-300 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare size={13} className={isActive ? 'text-indigo-400' : 'text-slate-500'} />
                  <span className="truncate">{session.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(session.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-0.5 rounded transition"
                  title="Delete Session"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
