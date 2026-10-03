import React, { useEffect, useState } from 'react'
import { Folder, FolderOpen, FileText, RefreshCw } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'

interface TreeEntry {
  path: string
  name: string
  isDir: boolean
}

export const WorkspaceTree: React.FC = () => {
  const { workspacePath } = useSessionStore()
  const [tree, setTree] = useState<TreeEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadTree = async () => {
    if (!window.agentApi || !workspacePath) return
    setIsLoading(true)
    try {
      const items = await window.agentApi.getWorkspaceTree(workspacePath)
      setTree(items)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTree()
  }, [workspacePath])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Workspace Files</span>
        <button
          onClick={loadTree}
          disabled={isLoading}
          className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition"
          title="Refresh Workspace Files"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
        {tree.length === 0 ? (
          <div className="text-xs text-slate-500 px-2 py-4 text-center">Empty directory</div>
        ) : (
          tree.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 truncate select-text cursor-default"
              title={entry.path}
            >
              {entry.isDir ? (
                <Folder size={13} className="text-amber-400/80 shrink-0" />
              ) : (
                <FileText size={13} className="text-slate-500 shrink-0" />
              )}
              <span className="truncate">{entry.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
