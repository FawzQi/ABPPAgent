import React, { useState } from 'react'
import { Wrench, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react'
import type { TimelineItem } from '@shared/types'
import { TerminalWidget } from './TerminalWidget'
import { InlineDiffCard } from './InlineDiffCard'
import { useSessionStore } from '../../stores/session-store'

interface ToolCardProps {
  item: TimelineItem
}

export const ToolCard: React.FC<ToolCardProps> = ({ item }) => {
  const { toolCall } = item
  const { approveTool, rejectTool, respondToUserInput } = useSessionStore()
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const [customInput, setCustomInput] = useState('')

  if (!toolCall) return null

  const { id, name, args, status, result, terminalStream, diff } = toolCall

  // 1. Terminal Command
  if (name === 'run_command') {
    return (
      <div className="my-2">
        <TerminalWidget
          command={args.CommandLine || ''}
          output={terminalStream || result?.output}
          exitCode={result?.exitCode}
          isError={result?.isError}
          isRunning={status === 'auto_approved' && !result}
        />
        {status === 'pending' && (
          <div className="flex items-center justify-between px-3 py-2 bg-amber-950/20 border border-amber-900/30 rounded text-xs">
            <span className="text-amber-300 font-medium">⚠️ Terminal command requires approval to run</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => approveTool(id)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded font-medium transition cursor-pointer"
              >
                Run Command
              </button>
              <button
                onClick={() => rejectTool(id)}
                className="bg-rose-600/80 hover:bg-rose-500 text-white px-2.5 py-1 rounded font-medium transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 2. File Mutation (write_file / replace_file_content)
  if (name === 'write_file' || name === 'replace_file_content') {
    const filePath = args.TargetFile || args.AbsolutePath || 'file'
    return (
      <InlineDiffCard
        toolName={name}
        filePath={filePath}
        diff={diff}
        status={status}
        onApprove={() => approveTool(id)}
        onReject={() => rejectTool(id)}
      />
    )
  }

  // 3. User Input (ask_user)
  if (name === 'ask_user') {
    const question = args.Question || 'The agent requested your input:'
    const options: string[] = args.Options || []

    return (
      <div className="rounded border border-indigo-800 bg-indigo-950/30 p-3 my-2 text-xs">
        <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-2">
          <HelpCircle size={15} className="text-indigo-400" />
          <span>{question}</span>
        </div>

        {options.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => respondToUserInput(id, opt)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded transition cursor-pointer font-medium"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customInput.trim()) {
                respondToUserInput(id, customInput.trim())
              }
            }}
            placeholder="Type your response..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => customInput.trim() && respondToUserInput(id, customInput.trim())}
            disabled={!customInput.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1 rounded transition cursor-pointer font-medium"
          >
            Reply
          </button>
        </div>
      </div>
    )
  }

  // 4. Default inspection tool (read_file, list_directory)
  return (
    <div className="rounded border border-slate-800 bg-slate-900/80 my-2 overflow-hidden text-xs">
      <div
        onClick={() => setIsOutputExpanded(!isOutputExpanded)}
        className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 hover:bg-slate-950 cursor-pointer select-none border-b border-slate-800/60"
      >
        <div className="flex items-center gap-2 truncate">
          <Wrench size={13} className="text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-200">{name}</span>
          <span className="text-slate-500 font-mono truncate">
            {args.AbsolutePath || args.DirectoryPath || JSON.stringify(args)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {result ? (
            result.isError ? (
              <span className="text-rose-400 flex items-center gap-1 text-[11px]">
                <XCircle size={12} /> Failed
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                <CheckCircle size={12} /> Completed
              </span>
            )
          ) : (
            <span className="text-blue-400 flex items-center gap-1 text-[11px]">
              <Clock size={12} className="animate-spin" /> In Progress
            </span>
          )}
          {isOutputExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
        </div>
      </div>

      {isOutputExpanded && result && (
        <div className="p-3 bg-slate-950/90 text-slate-300 font-mono text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto select-text leading-relaxed">
          {result.output}
        </div>
      )}
    </div>
  )
}
