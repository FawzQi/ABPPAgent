import React from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { X, RefreshCw } from 'lucide-react'
import { useGitStore } from '../../stores/git-store'
import { useDiffStore } from '../../stores/diff-store'

export const DiffViewer: React.FC = () => {
  const { selectedDiff, setSelectedDiff } = useGitStore()
  const { selectedFile, setSelectedFile } = useDiffStore()

  const customStyles = {
    variables: {
      dark: {
        diffViewerBackground: '#16181d',
        diffViewerColor: '#e6e8eb',
        addedBackground: '#064e3b33',
        addedColor: '#a7f3d0',
        removedBackground: '#88133733',
        removedColor: '#fecdd3',
        wordAddedBackground: '#04785755',
        wordRemovedBackground: '#be123c55',
        addedGutterBackground: '#064e3b44',
        removedGutterBackground: '#88133744',
        gutterBackground: '#1e2127',
        gutterBackgroundDark: '#16181d',
        highlightBackground: '#2a2f38',
        highlightGutterBackground: '#2a2f38',
      },
    },
    line: {
      fontSize: '11px',
      fontFamily: 'monospace',
    },
  }

  // Case 1: Git Diff is selected
  if (selectedDiff) {
    if (selectedDiff.loading) {
      return (
        <div className="flex-1 flex items-center justify-center p-4 text-xs text-slate-500">
          <RefreshCw size={13} className="animate-spin mr-1.5" /> Loading diff for {selectedDiff.path}...
        </div>
      )
    }

    if (selectedDiff.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-xs text-rose-400 text-center">
          <span>Failed to load diff: {selectedDiff.error}</span>
          <button
            onClick={() => setSelectedDiff(null)}
            className="mt-2 text-slate-400 hover:text-white underline cursor-pointer"
          >
            Close
          </button>
        </div>
      )
    }

    const original = selectedDiff.content?.original || ''
    const modified = selectedDiff.content?.modified || ''

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#16181d]">
        <div className="px-3 py-1.5 bg-[#16181d] border-b border-[#2c3038] flex items-center justify-between text-xs font-mono text-slate-300">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold truncate">{selectedDiff.path}</span>
            <span className="text-[10px] bg-[#1e2127] text-slate-400 border border-[#2c3038] px-1.5 py-0.5 rounded">
              {selectedDiff.staged ? 'Staged (HEAD ↔ Index)' : 'Unstaged (Index ↔ Working Tree)'}
            </span>
          </div>
          <button
            onClick={() => setSelectedDiff(null)}
            className="p-0.5 text-slate-400 hover:text-white rounded cursor-pointer hover:bg-[#2a2f38]"
            title="Close diff"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto font-mono text-[11px]">
          <ReactDiffViewer
            oldValue={original}
            newValue={modified}
            splitView={false}
            useDarkTheme={true}
            styles={customStyles}
          />
        </div>
      </div>
    )
  }

  // Case 2: Session Modified File is selected
  if (selectedFile) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#16181d]">
        <div className="px-3 py-1.5 bg-[#16181d] border-b border-[#2c3038] flex items-center justify-between text-xs font-mono text-slate-300">
          <span className="truncate">{selectedFile.path}</span>
          <button
            onClick={() => setSelectedFile(null)}
            className="p-0.5 text-slate-400 hover:text-white rounded cursor-pointer hover:bg-[#2a2f38]"
            title="Close diff"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto font-mono text-[11px]">
          <ReactDiffViewer
            oldValue={selectedFile.oldContent || ''}
            newValue={selectedFile.newContent || ''}
            splitView={false}
            useDarkTheme={true}
            styles={customStyles}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center text-xs text-slate-500 p-4 text-center">
      Select a file in Source Control to inspect before/after diff
    </div>
  )
}
