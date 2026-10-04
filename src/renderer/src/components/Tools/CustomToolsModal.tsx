import React, { useEffect, useState } from 'react'
import { X, Wrench, Terminal, FileText, Search, Network, FileEdit, Clock, Sliders, Zap, Check } from 'lucide-react'
import { useToolsStore } from '../../stores/tools-store'
import { useSessionStore } from '../../stores/session-store'
import type { CustomToolsConfig } from '@shared/types'

export const CustomToolsModal: React.FC = () => {
  const { isOpen, config, closeModal, toggleTool, loadConfig } = useToolsStore()
  const { activeSession, updateDelays } = useSessionStore()
  const [activeTab, setActiveTab] = useState<'tools' | 'delays'>('tools')

  const cooldownTimer = activeSession?.delays?.cooldownTimerMs ?? activeSession?.delays?.sendPromptDelayMs ?? 3000
  const sendDelay = activeSession?.delays?.sendDelayMs ?? activeSession?.delays?.interactionDelayMs ?? 1000
  const toolExecutionDelay = activeSession?.delays?.toolExecutionDelayMs ?? 150

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

  const handleCooldownTimerChange = (val: number) => {
    updateDelays({
      cooldownTimerMs: Math.max(500, Math.min(15000, val)),
      sendDelayMs: sendDelay,
      toolExecutionDelayMs: toolExecutionDelay,
      sendPromptDelayMs: Math.max(500, Math.min(15000, val)),
      interactionDelayMs: sendDelay,
    })
  }

  const handleSendDelayChange = (val: number) => {
    updateDelays({
      cooldownTimerMs: cooldownTimer,
      sendDelayMs: Math.max(100, Math.min(10000, val)),
      toolExecutionDelayMs: toolExecutionDelay,
      sendPromptDelayMs: cooldownTimer,
      interactionDelayMs: Math.max(100, Math.min(10000, val)),
    })
  }

  const handleToolExecutionDelayChange = (val: number) => {
    updateDelays({
      cooldownTimerMs: cooldownTimer,
      sendDelayMs: sendDelay,
      toolExecutionDelayMs: Math.max(25, Math.min(3000, val)),
      sendPromptDelayMs: cooldownTimer,
      interactionDelayMs: sendDelay,
    })
  }

  const applyPreset = (cooldownMs: number, sendMs: number, toolMs: number) => {
    updateDelays({
      cooldownTimerMs: cooldownMs,
      sendDelayMs: sendMs,
      toolExecutionDelayMs: toolMs,
      sendPromptDelayMs: cooldownMs,
      interactionDelayMs: sendMs,
    })
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
    {
      key: 'enablePostWriteCheck' as const,
      label: 'Post-write Typecheck',
      description: 'After file edits, runs tsc --noEmit in the workspace and appends errors to the tool result.',
      tools: ['tsc --noEmit'],
      icon: <Check size={16} className="text-rose-400" />,
      checked: !!config.enablePostWriteCheck,
    },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Sliders size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Session Settings & Tools</h2>
              <p className="text-[11px] text-slate-400">Configure agent capabilities, pacing & prompt delays</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-4 pt-1 gap-2">
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition cursor-pointer ${
              activeTab === 'tools'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench size={13} />
            <span>Custom Tools</span>
          </button>
          <button
            onClick={() => setActiveTab('delays')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition cursor-pointer ${
              activeTab === 'delays'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock size={13} />
            <span>Pacing & Delays</span>
          </button>
        </div>

        {/* Modal Body */}
        {activeTab === 'tools' ? (
          <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
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
        ) : (
          <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Delay 1: Cooldown Timer */}
            <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={15} className="text-amber-400" />
                  <div>
                    <span className="text-xs font-semibold text-slate-200">Elapsed Cooldown Timer</span>
                    <p className="text-[11px] text-slate-400">
                      Timer starts when response is received from LLM; blocks next turn until elapsed
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {(cooldownTimer / 1000).toFixed(1)}s
                  </span>
                  <span className="text-[10px] text-slate-500 ml-1">({cooldownTimer}ms)</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="500"
                  max="10000"
                  step="250"
                  value={cooldownTimer}
                  onChange={(e) => handleCooldownTimerChange(Number(e.target.value))}
                  className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="500"
                  max="15000"
                  step="250"
                  value={cooldownTimer}
                  onChange={(e) => handleCooldownTimerChange(Number(e.target.value))}
                  className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 text-right font-mono focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Delay 2: Send Prompt Delay */}
            <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-sky-400" />
                  <div>
                    <span className="text-xs font-semibold text-slate-200">Send Prompt Delay</span>
                    <p className="text-[11px] text-slate-400">
                      Pause after typing into web chat editor before clicking send (+ 50-150ms random jitter)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-sky-400">
                    {(sendDelay / 1000).toFixed(1)}s
                  </span>
                  <span className="text-[10px] text-slate-500 ml-1">(+jitter)</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="200"
                  max="5000"
                  step="100"
                  value={sendDelay}
                  onChange={(e) => handleSendDelayChange(Number(e.target.value))}
                  className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={sendDelay}
                  onChange={(e) => handleSendDelayChange(Number(e.target.value))}
                  className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 text-right font-mono focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Delay 3: Tool Execution Delay */}
            <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders size={15} className="text-purple-400" />
                  <div>
                    <span className="text-xs font-semibold text-slate-200">Tool Execution Delay</span>
                    <p className="text-[11px] text-slate-400">
                      Pause between sequential tool calls for filesystem and process stability
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-purple-400">
                    {toolExecutionDelay}ms
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="25"
                  value={toolExecutionDelay}
                  onChange={(e) => handleToolExecutionDelayChange(Number(e.target.value))}
                  className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="25"
                  max="3000"
                  step="25"
                  value={toolExecutionDelay}
                  onChange={(e) => handleToolExecutionDelayChange(Number(e.target.value))}
                  className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 text-right font-mono focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="pt-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Quick Presets
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset(1000, 500, 100)}
                  className={`px-2.5 py-2 rounded border text-left transition cursor-pointer ${
                    cooldownTimer === 1000 && sendDelay === 500 && toolExecutionDelay === 100
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Fast</span>
                    {cooldownTimer === 1000 && sendDelay === 500 && toolExecutionDelay === 100 && <Check size={12} />}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">1.0s / 0.5s / 100ms</span>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset(3000, 1000, 150)}
                  className={`px-2.5 py-2 rounded border text-left transition cursor-pointer ${
                    cooldownTimer === 3000 && sendDelay === 1000 && toolExecutionDelay === 150
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Balanced</span>
                    {cooldownTimer === 3000 && sendDelay === 1000 && toolExecutionDelay === 150 && <Check size={12} />}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">3.0s / 1.0s / 150ms</span>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset(5000, 2000, 250)}
                  className={`px-2.5 py-2 rounded border text-left transition cursor-pointer ${
                    cooldownTimer === 5000 && sendDelay === 2000 && toolExecutionDelay === 250
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Safe</span>
                    {cooldownTimer === 5000 && sendDelay === 2000 && toolExecutionDelay === 250 && <Check size={12} />}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">5.0s / 2.0s / 250ms</span>
                </button>
              </div>
            </div>
          </div>
        )}

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
