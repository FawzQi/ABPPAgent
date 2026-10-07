import React, { useState, useRef, useEffect } from 'react'
import { Send, Square, Sparkles } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'

export const Composer: React.FC = () => {
  const [text, setText] = useState('')
  const [suggestEnabled, setSuggestEnabled] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { activeSession, sendUserMessage, abortAgent } = useSessionStore()

  const isRunning = activeSession?.status === 'running'

  // Fetch file suggestion settings
  useEffect(() => {
    if (window.agentApi?.getFileSuggestionSettings) {
      window.agentApi
        .getFileSuggestionSettings()
        .then((s) => {
          if (s) setSuggestEnabled(s.enabled ?? true)
        })
        .catch(() => {})
    }
  }, [])

  const handleToggleSuggest = async () => {
    if (!window.agentApi?.saveFileSuggestionSettings) return
    const next = !suggestEnabled
    setSuggestEnabled(next)
    try {
      await window.agentApi.saveFileSuggestionSettings({ enabled: next })
    } catch {
      setSuggestEnabled(!next)
    }
  }

  const handleSubmit = async () => {
    if (!text.trim() || isRunning) return
    const msg = text.trim()
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await sendUserMessage(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }

  return (
    <div className="border-t border-[#2c3038] bg-[#16181d] p-3">
      {/* Quick Action Pills */}
      <div className="flex items-center gap-2 mb-2 overflow-x-visible text-[11px]">
        {/* File Suggestion Toggle */}
        <button
          onClick={handleToggleSuggest}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition border text-[11px] select-none ${
            suggestEnabled
              ? 'bg-[#1e2127] text-sky-300 border-sky-500/40 hover:bg-[#2a2f38]'
              : 'bg-[#1e2127] text-slate-500 border-[#2c3038] hover:bg-[#2a2f38] hover:text-slate-400'
          }`}
          title={
            suggestEnabled
              ? 'File suggestion is enabled (click to disable)'
              : 'File suggestion is disabled (click to enable)'
          }
        >
          <Sparkles size={11} className={suggestEnabled ? 'text-sky-400' : 'text-slate-500'} />
          <span>Suggest: {suggestEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <span className="text-slate-500 text-[10px] ml-auto">
          Enter to send • Shift+Enter for newline
        </span>
      </div>

      <div className="relative flex items-end gap-2 bg-[#16181d] border border-[#2c3038] rounded-lg p-2 focus-within:border-sky-500 transition">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isRunning
              ? 'Agent is working on the task in background...'
              : 'Ask agent to inspect, fix, or build anything...'
          }
          disabled={isRunning}
          rows={1}
          className="flex-1 bg-transparent resize-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none leading-relaxed max-h-40"
        />

        {isRunning ? (
          <button
            onClick={abortAgent}
            className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition shrink-0"
            title="Abort current execution"
          >
            <Square size={13} fill="currentColor" />
            <span>Abort</span>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex items-center gap-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition shrink-0"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        )}
      </div>
    </div>
  )
}
