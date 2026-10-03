import React from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { useDiffStore } from '../../stores/diff-store'

export const DiffViewer: React.FC = () => {
  const { selectedFile } = useDiffStore()

  if (!selectedFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-500 p-4 text-center">
        Select a modified file above to inspect before/after diff
      </div>
    )
  }

  const customStyles = {
    variables: {
      dark: {
        diffViewerBackground: '#0b1120',
        diffViewerColor: '#cbd5e1',
        addedBackground: '#064e3b33',
        addedColor: '#a7f3d0',
        removedBackground: '#88133733',
        removedColor: '#fecdd3',
        wordAddedBackground: '#04785755',
        wordRemovedBackground: '#be123c55',
        addedGutterBackground: '#064e3b44',
        removedGutterBackground: '#88133744',
        gutterBackground: '#0f172a',
        gutterBackgroundDark: '#020617',
        highlightBackground: '#1e293b',
        highlightGutterBackground: '#1e293b',
      },
    },
    line: {
      fontSize: '11px',
      fontFamily: 'monospace',
    },
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 text-xs font-mono text-slate-300 truncate">
        {selectedFile.path}
      </div>
      <div className="flex-1 overflow-auto bg-slate-950 font-mono text-[11px]">
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
