import React, { useEffect } from 'react'
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  RotateCcw,
  Trash2,
  Check,
  AlertCircle,
  FileCode,
} from 'lucide-react'
import { useGitStore } from '../../stores/git-store'
import { useSessionStore } from '../../stores/session-store'
import type { GitFileStatusCode } from '@shared/types'

const STATUS_LETTER: Record<GitFileStatusCode, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechange: 'T',
  conflicted: 'U',
}

const STATUS_COLOR: Record<GitFileStatusCode, string> = {
  added: 'text-emerald-400',
  modified: 'text-amber-400',
  deleted: 'text-rose-400',
  renamed: 'text-sky-400',
  copied: 'text-sky-400',
  typechange: 'text-amber-400',
  conflicted: 'text-rose-400',
}

export const SourceControlPanel: React.FC = () => {
  const { workspacePath } = useSessionStore()
  const {
    projectRoot,
    gitStatus,
    gitStatusLoading,
    gitBusy,
    gitCommitMessage,
    selectedDiff,
    error,
    setProjectRoot,
    setGitCommitMessage,
    refreshGitStatus,
    initGitRepo,
    stageFile,
    stageAll,
    unstageFile,
    discardFile,
    discardAll,
    commitChanges,
    loadDiff,
  } = useGitStore()

  useEffect(() => {
    if (workspacePath && workspacePath !== projectRoot) {
      setProjectRoot(workspacePath)
    }
  }, [workspacePath, projectRoot])

  if (!workspacePath) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-slate-500 text-center">
        Open a workspace folder to view Source Control.
      </div>
    )
  }

  if (gitStatus === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-3">
        <GitBranch size={28} className="text-slate-500" />
        <p className="text-xs text-slate-400 max-w-xs">
          This folder is not a Git repository. Initialize one to track changes, stage files, and commit.
        </p>
        <button
          onClick={() => initGitRepo()}
          disabled={gitBusy}
          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition cursor-pointer disabled:opacity-50"
        >
          {gitBusy ? 'Initializing...' : 'Initialize Repository'}
        </button>
      </div>
    )
  }

  if (gitStatus === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-slate-500">
        <RefreshCw size={14} className="animate-spin mr-1.5" /> Loading Git status...
      </div>
    )
  }

  const hasStaged = gitStatus.staged.length > 0
  const hasUnstaged = gitStatus.unstaged.length > 0
  const hasUntracked = gitStatus.untracked.length > 0
  const hasAnyChanges = hasStaged || hasUnstaged || hasUntracked
  const canCommit = hasStaged && gitCommitMessage.trim().length > 0 && !gitBusy

  return (
    <div className="flex flex-col h-full bg-[#16181d] border-b border-[#2c3038] text-slate-200">
      {/* Git Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2c3038] bg-[#16181d]">
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 truncate">
          <GitBranch size={13} className="text-sky-400 shrink-0" />
          <span className="font-semibold truncate">{gitStatus.branch || '(detached)'}</span>
          {gitStatus.ahead > 0 && (
            <span className="text-[10px] text-slate-400" title={`${gitStatus.ahead} commits ahead`}>
              ↑{gitStatus.ahead}
            </span>
          )}
          {gitStatus.behind > 0 && (
            <span className="text-[10px] text-slate-400" title={`${gitStatus.behind} commits behind`}>
              ↓{gitStatus.behind}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasAnyChanges && (
            <button
              onClick={() => stageAll()}
              disabled={gitBusy}
              className="text-[11px] px-1.5 py-0.5 rounded bg-[#1e2127] hover:bg-[#2a2f38] text-slate-300 border border-[#2c3038] transition cursor-pointer"
              title="Stage all changes"
            >
              Stage all
            </button>
          )}
          {hasUnstaged && (
            <button
              onClick={() => discardAll()}
              disabled={gitBusy}
              className="text-[11px] px-1.5 py-0.5 rounded bg-[#1e2127] hover:bg-[#2a2f38] text-slate-300 border border-[#2c3038] transition cursor-pointer"
              title="Discard all unstaged changes"
            >
              Discard all
            </button>
          )}
          <button
            onClick={() => refreshGitStatus()}
            disabled={gitStatusLoading || gitBusy}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#2a2f38] transition cursor-pointer"
            title="Refresh Git status"
          >
            <RefreshCw size={12} className={gitStatusLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Commit Box */}
      <div className="p-2 border-b border-[#2c3038] space-y-1.5">
        <textarea
          value={gitCommitMessage}
          onChange={(e) => setGitCommitMessage(e.target.value)}
          placeholder="Commit message (Enter to commit, Shift+Enter for newline)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && canCommit) {
              e.preventDefault()
              commitChanges()
            }
          }}
          rows={2}
          className="w-full bg-[#1e2127] border border-[#2c3038] rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none font-sans"
        />
        <button
          onClick={() => commitChanges()}
          disabled={!canCommit}
          className="w-full py-1 px-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Check size={12} />
          <span>{gitBusy ? 'Committing...' : 'Commit'}</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 bg-rose-950/60 border-b border-rose-800/60 text-[11px] text-rose-300 flex items-center gap-1.5">
          <AlertCircle size={12} className="shrink-0 text-rose-400" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* File Lists */}
      <div className="flex-1 overflow-y-auto min-h-0 select-none divide-y divide-[#2c3038]/50">
        {/* Staged Changes */}
        {hasStaged && (
          <div className="py-1">
            <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Staged Changes ({gitStatus.staged.length})</span>
            </div>
            <div className="space-y-0.5 px-1">
              {gitStatus.staged.map((f) => {
                const isSelected = selectedDiff?.path === f.path && selectedDiff?.staged === true
                return (
                  <div
                    key={`staged-${f.path}`}
                    className={`group flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#1e2127] text-sky-300 border border-[#2c3038]'
                        : 'text-slate-300 hover:bg-[#1e2127] hover:text-white border border-transparent'
                    }`}
                  >
                    <span className={`w-3 font-mono font-bold text-[11px] ${STATUS_COLOR[f.status]}`}>
                      {STATUS_LETTER[f.status]}
                    </span>
                    <button
                      onClick={() => loadDiff(f.path, true)}
                      className="flex-1 truncate text-left cursor-pointer"
                      title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                    >
                      {f.path}
                    </button>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          unstageFile(f.path)
                        }}
                        disabled={gitBusy}
                        className="p-0.5 hover:text-white rounded"
                        title="Unstage changes"
                      >
                        <Minus size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Changes (Unstaged) */}
        {hasUnstaged && (
          <div className="py-1">
            <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Changes ({gitStatus.unstaged.length})</span>
            </div>
            <div className="space-y-0.5 px-1">
              {gitStatus.unstaged.map((f) => {
                const isSelected = selectedDiff?.path === f.path && selectedDiff?.staged === false
                return (
                  <div
                    key={`unstaged-${f.path}`}
                    className={`group flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#1e2127] text-sky-300 border border-[#2c3038]'
                        : 'text-slate-300 hover:bg-[#1e2127] hover:text-white border border-transparent'
                    }`}
                  >
                    <span className={`w-3 font-mono font-bold text-[11px] ${STATUS_COLOR[f.status]}`}>
                      {STATUS_LETTER[f.status]}
                    </span>
                    <button
                      onClick={() => loadDiff(f.path, false)}
                      className="flex-1 truncate text-left cursor-pointer"
                      title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                    >
                      {f.path}
                    </button>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          discardFile(f.path)
                        }}
                        disabled={gitBusy}
                        className="p-0.5 hover:text-rose-400 rounded"
                        title="Discard changes"
                      >
                        <RotateCcw size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          stageFile(f.path)
                        }}
                        disabled={gitBusy}
                        className="p-0.5 hover:text-emerald-400 rounded"
                        title="Stage changes"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Untracked Files */}
        {hasUntracked && (
          <div className="py-1">
            <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Untracked Files ({gitStatus.untracked.length})</span>
            </div>
            <div className="space-y-0.5 px-1">
              {gitStatus.untracked.map((filePath) => {
                const isSelected = selectedDiff?.path === filePath && selectedDiff?.staged === false
                return (
                  <div
                    key={`untracked-${filePath}`}
                    className={`group flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#1e2127] text-sky-300 border border-[#2c3038]'
                        : 'text-slate-300 hover:bg-[#1e2127] hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="w-3 font-mono font-bold text-[11px] text-emerald-400">U</span>
                    <button
                      onClick={() => loadDiff(filePath, false)}
                      className="flex-1 truncate text-left cursor-pointer"
                      title={filePath}
                    >
                      {filePath}
                    </button>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          discardFile(filePath)
                        }}
                        disabled={gitBusy}
                        className="p-0.5 hover:text-rose-400 rounded"
                        title="Delete untracked file"
                      >
                        <Trash2 size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          stageFile(filePath)
                        }}
                        disabled={gitBusy}
                        className="p-0.5 hover:text-emerald-400 rounded"
                        title="Stage file"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!hasAnyChanges && (
          <div className="flex flex-col items-center justify-center p-6 text-xs text-slate-500 text-center">
            <FileCode size={20} className="mb-1 opacity-50" />
            <span>Working tree clean</span>
            <span className="text-[10px] text-slate-600 mt-0.5">No changes to commit</span>
          </div>
        )}
      </div>
    </div>
  )
}
