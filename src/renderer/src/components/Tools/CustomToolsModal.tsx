import React, { useEffect, useState } from 'react'
import { X, Wrench, Terminal, FileText, Search, Network, FileEdit, Clock, Sliders, Zap, Check, Sparkles, Key, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { useToolsStore } from '../../stores/tools-store'
import { useSessionStore } from '../../stores/session-store'
import type { CustomToolsConfig, FileSuggestionSettings, AiProviderId, ChatProviderId, AiProviderInfo } from '@shared/types'

export const CustomToolsModal: React.FC = () => {
  const { isOpen, config, closeModal, toggleTool, loadConfig } = useToolsStore()
  const { activeSession, updateDelays } = useSessionStore()
  const [activeTab, setActiveTab] = useState<'tools' | 'delays' | 'suggest'>('tools')

  const [suggestSettings, setSuggestSettings] = useState<FileSuggestionSettings | null>(null)
  const [aiProviders, setAiProviders] = useState<AiProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState<ChatProviderId>('deepseek')
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [keySavedMessage, setKeySavedMessage] = useState(false)

  const [typesafeKeyDraft, setTypesafeKeyDraft] = useState('')
  const [showTypesafeKey, setShowTypesafeKey] = useState(false)
  const [typesafeSavedMessage, setTypesafeSavedMessage] = useState(false)

  const cooldownTimer = activeSession?.delays?.cooldownTimerMs ?? activeSession?.delays?.sendPromptDelayMs ?? 3000
  const sendDelay = activeSession?.delays?.sendDelayMs ?? activeSession?.delays?.interactionDelayMs ?? 1000
  const toolExecutionDelay = activeSession?.delays?.toolExecutionDelayMs ?? 150

  useEffect(() => {
    if (activeSession?.id) {
      loadConfig(activeSession.id)
    }
  }, [activeSession?.id])

  useEffect(() => {
    if (isOpen && window.agentApi) {
      window.agentApi.getFileSuggestionSettings().then((s) => {
        setSuggestSettings(s)
        const prov = (s.hydeProvider || s.provider || 'deepseek') as ChatProviderId
        setSelectedProvider(prov === ('typesafe' as any) ? 'deepseek' : prov)
      }).catch(() => {})
      window.agentApi.getAiProviders().then((p) => {
        setAiProviders(p)
      }).catch(() => {})
    }
  }, [isOpen])

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

  const handleUpdateSuggest = async (updates: any) => {
    if (!window.agentApi) return
    const updated = await window.agentApi.saveFileSuggestionSettings(updates)
    setSuggestSettings(updated)
  }

  const handleSaveApiKey = async () => {
    if (!window.agentApi || !apiKeyDraft.trim()) return
    const updated = await window.agentApi.saveFileSuggestionSettings({
      apiKey: { provider: selectedProvider, key: apiKeyDraft.trim() },
    })
    setSuggestSettings(updated)
    setApiKeyDraft('')
    setKeySavedMessage(true)
    setTimeout(() => setKeySavedMessage(false), 3000)
  }

  const handleClearApiKey = async () => {
    if (!window.agentApi) return
    const updated = await window.agentApi.saveFileSuggestionSettings({
      apiKey: { provider: selectedProvider, key: '' },
    })
    setSuggestSettings(updated)
    setApiKeyDraft('')
  }

  const handleSaveTypesafeKey = async () => {
    if (!window.agentApi || !typesafeKeyDraft.trim()) return
    const updated = await window.agentApi.saveFileSuggestionSettings({
      apiKey: { provider: 'typesafe', key: typesafeKeyDraft.trim() },
    })
    setSuggestSettings(updated)
    setTypesafeKeyDraft('')
    setTypesafeSavedMessage(true)
    setTimeout(() => setTypesafeSavedMessage(false), 3000)
  }

  const handleClearTypesafeKey = async () => {
    if (!window.agentApi) return
    const updated = await window.agentApi.saveFileSuggestionSettings({
      apiKey: { provider: 'typesafe', key: '' },
    })
    setSuggestSettings(updated)
    setTypesafeKeyDraft('')
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
      <div className="w-full max-w-xl max-h-[85vh] bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
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
          <button
            onClick={() => setActiveTab('suggest')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition cursor-pointer ${
              activeTab === 'suggest'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={13} />
            <span>File Suggestion</span>
          </button>
        </div>

        {/* Modal Body */}
        {activeTab === 'tools' && (
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
        )}

        {/* Tab 2: Pacing & Delays */}
        {activeTab === 'delays' && (
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

        {/* Tab 3: File Suggestion (HyDE & Jev) */}
        {activeTab === 'suggest' && (
          <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Master Toggle */}
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={suggestSettings?.enabled ?? true}
                  onChange={(e) => handleUpdateSuggest({ enabled: e.target.checked })}
                  className="mt-0.5 size-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 accent-indigo-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" />
                    <span className="text-xs font-medium text-slate-200">
                      Enable Codebase Context & File Suggestions
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Automatically scans the repository to inject project structure and relevant file contents into the prompt for higher accuracy.
                  </p>
                </div>
              </label>
            </div>

            {/* Pipeline Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 block">
                File Suggestion Method
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div
                  onClick={() => handleUpdateSuggest({ method: 'gitnexus-bm25' })}
                  className={`p-3 rounded-lg border cursor-pointer transition select-none ${
                    (suggestSettings?.method ?? 'gitnexus-bm25') === 'gitnexus-bm25'
                      ? 'bg-indigo-950/30 border-indigo-500/80 text-slate-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">GitNexus + BM25</span>
                    {(suggestSettings?.method ?? 'gitnexus-bm25') === 'gitnexus-bm25' && (
                      <Check size={14} className="text-indigo-400" />
                    )}
                  </div>
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-[10px] text-emerald-300 font-mono">
                    100% Offline • 0 Tokens
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Local recall using GitNexus graph query, BM25 shallow index, and git recency/co-change. No API calls or keys required.
                  </p>
                </div>

                <div
                  onClick={() => handleUpdateSuggest({ method: 'hyde-gitnexus-bm25-jev' })}
                  className={`p-3 rounded-lg border cursor-pointer transition select-none ${
                    suggestSettings?.method === 'hyde-gitnexus-bm25-jev'
                      ? 'bg-indigo-950/30 border-indigo-500/80 text-slate-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">HyDE + GitNexus + BM25 + Jev</span>
                    {suggestSettings?.method === 'hyde-gitnexus-bm25-jev' && (
                      <Check size={14} className="text-indigo-400" />
                    )}
                  </div>
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40 text-[10px] text-indigo-300 font-mono">
                    AI Expansion & Precision Scoring
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Stage-1 HyDE AI expansion + local hybrid search + token-efficient skeletons + Jev calibrated 0–3 relevance scoring.
                  </p>
                </div>
              </div>
            </div>

            {/* HyDE Provider, Model & API Key Configuration */}
            <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/40 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Key size={13} className="text-amber-400" />
                    HyDE Query Expansion Provider
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Chat model used for Stage-1 Hypothetical Document Embeddings (query expansion).
                  </p>
                </div>
              </div>

              {/* Provider Selection Pills (Excludes TypeSafe Jev) */}
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Select Chat Provider for HyDE</label>
                <div className="flex flex-wrap gap-1.5">
                  {(aiProviders.length > 0 ? aiProviders : [
                    { id: 'deepseek', label: 'DeepSeek', keyUrl: 'https://platform.deepseek.com/api_keys', models: ['deepseek-flash', 'deepseek-chat'] },
                    { id: 'groq', label: 'Groq', keyUrl: 'https://console.groq.com/keys', models: ['llama-3.3-70b-versatile'] },
                    { id: 'openai', label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', models: ['gpt-4o-mini', 'gpt-4o'] },
                    { id: 'openrouter', label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', models: ['z-ai/glm-5.2:free'] },
                    { id: 'google', label: 'Google AI Studio', keyUrl: 'https://aistudio.google.com/apikey', models: ['gemini-2.0-flash'] },
                  ])
                    .filter((p) => p.id !== 'typesafe')
                    .map((p) => {
                      const isSelected = selectedProvider === p.id
                      const hasKey = suggestSettings?.hasApiKey[p.id as AiProviderId]
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProvider(p.id as ChatProviderId)
                            handleUpdateSuggest({
                              hydeProvider: p.id as ChatProviderId,
                              provider: p.id as ChatProviderId,
                            })
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition cursor-pointer ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-950/60 text-indigo-200'
                              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <span>{p.label}</span>
                          {hasKey && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Key Configured" />}
                        </button>
                      )
                    })}
                </div>
              </div>

              {/* Active Provider Details */}
              {(() => {
                const activeInfo = aiProviders.find((p) => p.id === selectedProvider)
                const hasKey = suggestSettings?.hasApiKey[selectedProvider]
                const currentModel =
                  suggestSettings?.hydeModel ||
                  suggestSettings?.modelByProvider[selectedProvider] ||
                  activeInfo?.models[0] ||
                  ''

                return (
                  <div className="pt-2 border-t border-slate-800/80 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{activeInfo?.label || selectedProvider}</span>
                      {activeInfo?.keyUrl && (
                        <a
                          href={activeInfo.keyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          <span>Get API Key</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>

                    {/* Model Configuration */}
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">Model Name</label>
                      <input
                        type="text"
                        value={currentModel}
                        onChange={(e) =>
                          handleUpdateSuggest({
                            hydeModel: e.target.value,
                            model: { provider: selectedProvider, model: e.target.value },
                          })
                        }
                        placeholder="e.g. deepseek-flash"
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      {activeInfo && activeInfo.models.length > 1 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {activeInfo.models.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() =>
                                handleUpdateSuggest({
                                  hydeModel: m,
                                  model: { provider: selectedProvider, model: m },
                                })
                              }
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition cursor-pointer ${
                                currentModel === m
                                  ? 'border-indigo-500/70 bg-indigo-950/40 text-indigo-300'
                                  : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* API Key Input */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-medium text-slate-400">
                          API Key {hasKey && <span className="text-emerald-400 ml-1 font-normal">(✓ Saved)</span>}
                        </label>
                        {hasKey && (
                          <button
                            type="button"
                            onClick={handleClearApiKey}
                            className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
                          >
                            Remove Key
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKeyDraft}
                            onChange={(e) => setApiKeyDraft(e.target.value)}
                            placeholder={hasKey ? '••••••••••••••••••••••••••••••••' : 'Paste API key here...'}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono pr-8"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          >
                            {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveApiKey}
                          disabled={!apiKeyDraft.trim()}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer shrink-0 ${
                            apiKeyDraft.trim()
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          Save
                        </button>
                      </div>
                      {keySavedMessage && (
                        <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                          <Check size={11} /> Key encrypted and saved securely!
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Dedicated TypeSafe (Jev) Precision Scoring Section */}
            <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-indigo-400" />
                      TypeSafe (Jev) Precision Scoring
                    </h3>
                    {suggestSettings?.hasApiKey['typesafe'] ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-[10px] text-emerald-300 font-mono">
                        ✓ Configured
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/40 text-[10px] text-slate-400 font-mono">
                        No API Key
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Jev is used exclusively for candidate precision scoring on a calibrated 0–3 relevance rubric.
                  </p>
                </div>
                <a
                  href="https://typesafe.ai/console"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  <span>Get Jev Key</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block font-medium">Scoring Model:</span>
                  <span className="text-slate-200 font-mono">jev-latest</span>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block font-medium">Calibrated Inclusion:</span>
                  <span className="text-slate-200">Score ≥ 3 & Conf ≥ 85%</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-400">
                    TypeSafe API Key {suggestSettings?.hasApiKey['typesafe'] && <span className="text-emerald-400 ml-1 font-normal">(✓ Saved)</span>}
                  </label>
                  {suggestSettings?.hasApiKey['typesafe'] && (
                    <button
                      type="button"
                      onClick={handleClearTypesafeKey}
                      className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
                    >
                      Remove Key
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showTypesafeKey ? 'text' : 'password'}
                      value={typesafeKeyDraft}
                      onChange={(e) => setTypesafeKeyDraft(e.target.value)}
                      placeholder={suggestSettings?.hasApiKey['typesafe'] ? '••••••••••••••••••••••••••••••••' : 'Paste TypeSafe API key here...'}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTypesafeKey(!showTypesafeKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showTypesafeKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveTypesafeKey}
                    disabled={!typesafeKeyDraft.trim()}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer shrink-0 ${
                      typesafeKeyDraft.trim()
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Save
                  </button>
                </div>
                {typesafeSavedMessage && (
                  <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                    <Check size={11} /> TypeSafe key encrypted and saved securely!
                  </p>
                )}
              </div>
            </div>

            {/* HyDE Option when HyDE mode is chosen */}
            {suggestSettings?.method === 'hyde-gitnexus-bm25-jev' && (
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={suggestSettings.enableHyde ?? true}
                    onChange={(e) => handleUpdateSuggest({ enableHyde: e.target.checked })}
                    className="size-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-300">
                    Use HyDE AI Query Expansion (Hypothetical Document Embeddings)
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-5.5">
                  Translates high-level feature requests into concrete code identifiers and function names using a fast Stage-1 prompt.
                </p>
              </div>
            )}
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
