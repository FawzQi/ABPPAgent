import React, { useEffect } from 'react'
import { FileCode, RefreshCw } from 'lucide-react'
import { useDiffStore } from '../../stores/diff-store'
import { useSessionStore } from '../../stores/session-store'

export const FileChangesList: React.FC = () => {
  const { modifiedFiles, selectedFile, setSelectedFile, loadModifiedFiles } = useDiffStore()
  const { activeSession } = useSessionStore()

  useEffect(() => {
    if (activeSession) {
      loadModifiedFiles(activeSession.id)
    }
  }, [activeSession?.id])

  return (
    <div className="flex flex-col border-b border-slate-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Modified Files ({modifiedFiles.length})
        </span>
        {activeSession && (
          <button
            onClick={() => loadModifiedFiles(activeSession.id)}
            className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition cursor-pointer"
            title="Refresh changes"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto p-2 space-y-1">
        {modifiedFiles.length === 0 ? (
          <div className="text-xs text-slate-500 px-2 py-4 text-center">No modified files yet</div>
        ) : (
          modifiedFiles.map((file) => {
            const isSelected = selectedFile?.path === file.path
            return (
              <div
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition ${
                  isSelected
                    ? 'bg-slate-800 text-indigo-300 border border-slate-700/60'
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileCode size={13} className="text-slate-500 shrink-0" />
                  <span className="truncate">{file.path.split('/').pop()}</span>
                </div>
                <div className="flex items-center gap-1 font-mono text-[11px] shrink-0">
                  <span className="text-emerald-400 font-medium">+{file.additions}</span>
                  <span className="text-rose-400 font-medium">-{file.deletions}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
