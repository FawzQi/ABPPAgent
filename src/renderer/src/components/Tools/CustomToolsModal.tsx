import React, { useEffect } from 'react'
import { X, Wrench, Terminal, FileText, Search, Network, FileEdit } from 'lucide-react'
import { useToolsStore } from '../../stores/tools-store'
import { useSessionStore } from '../../stores/session-store'
import type { CustomToolsConfig } from '@shared/types'

export const CustomToolsModal: React.FC = () => {
  const { isOpen, config, closeModal, toggleTool, loadConfig } = useToolsStore()
  const { activeSession } = useSessionStore()

  useEffect(() => {
    if (activeSession?.id) {
      loadConfig(activeSession.id)
    }
  }, [activeSession?.id])

  if (!isOpen) return null

  const handleToggle = (key: keyof CustomToolsConfig) => {
    if (activeSession?.id) {
      toggleTool(activeSession.id, key)
    }
  }

  const toolItems = [
    {
      key: 'enableGitnexus' as const,
      label: 'GitNexus Semantic Graph (CLI)',
      description: 'Allows agent to execute gitnexus query and gitnexus context for symbol graphs.',
      tools: ['gitnexus_query', 'gitnexus_context'],
      icon: <Network size={16} className="text-indigo-400" />,
      checked: config.enableGitnexus,
    },
    {
      key: 'enableGrep' as const,
      label: 'Grep Search (CLI)',
      description: 'Allows agent to run fast regex code searches across files using grep -rnE.',
      tools: ['grep_search'],
      icon: <Search size={16} className="text-amber-400" />,
      checked: config.enableGrep,
    },
    {
      key: 'enableFullFile' as const,
      label: 'Whole-File Read & Copy to Chat',
      description: 'Allows agent to read full files without line pagination and copy entire files to web chat.',
      tools: ['read_file_full', 'copy_file_to_chat'],
      icon: <FileText size={16} className="text-emerald-400" />,
      checked: config.enableFullFile,
    },
    {
      key: 'enableRunCommand' as const,
      label: 'Terminal Commands',
      description: 'Allows agent to run arbitrary shell commands in the workspace.',
      tools: ['run_command'],
      icon: <Terminal size={16} className="text-sky-400" />,
      checked: config.enableRunCommand,
    },
    {
      key: 'enableFileMutation' as const,
      label: 'File Mutations (Write & Edit)',
      description: 'Allows agent to write new files and surgically replace text blocks in existing files.',
      tools: ['write_file', 'replace_file_content'],
      icon: <FileEdit size={16} className="text-purple-400" />,
      checked: config.enableFileMutation,
    },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Wrench size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Custom Tools & Capabilities</h2>
              <p className="text-[11px] text-slate-400">Configure which tools and CLI commands the agent can access</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tool Items List */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {toolItems.map((item) => (
            <div
              key={item.key}
              onClick={() => handleToggle(item.key)}
              className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer select-none ${
                item.checked
                  ? 'bg-slate-800/60 border-slate-700 text-slate-200'
                  : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700/60'
              }`}
            >
              <div className="mt-0.5 shrink-0">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{item.label}</span>
                  <div
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                      item.checked ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                        item.checked ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.tools.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800 bg-slate-950/40 text-xs">
          <span className="text-[11px] text-slate-500">Settings save automatically to active session</span>
          <button
            onClick={closeModal}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
