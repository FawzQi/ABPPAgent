import React, { useState, useRef, useEffect } from 'react'
import { Send, Square, FileCode, Sparkles } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'

export const Composer: React.FC = () => {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { activeSession, sendUserMessage, abortAgent } = useSessionStore()

  const isRunning = activeSession?.status === 'running'

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

  const insertSnippet = (snippet: string) => {
    setText((prev) => (prev ? `${prev} ${snippet}` : snippet))
    textareaRef.current?.focus()
  }

  return (
    <div className="border-t border-slate-800 bg-slate-900/60 p-3">
      {/* Quick Action Pills */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto text-[11px]">
        <button
          onClick={() => insertSnippet('/plan')}
          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded cursor-pointer transition border border-slate-700/50"
        >
          <Sparkles size={11} className="text-amber-400" />
          <span>/plan</span>
        </button>
        <button
          onClick={() => insertSnippet('@file')}
          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded cursor-pointer transition border border-slate-700/50"
        >
          <FileCode size={11} className="text-indigo-400" />
          <span>@file</span>
        </button>
        <span className="text-slate-600 text-[10px] ml-auto">
          Enter to send • Shift+Enter for newline
        </span>
      </div>

      <div className="relative flex items-end gap-2 bg-slate-950 border border-slate-700/80 rounded-lg p-2 focus-within:border-indigo-500 transition">
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
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition shrink-0"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        )}
      </div>
    </div>
  )
}
