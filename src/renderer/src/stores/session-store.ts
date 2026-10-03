import { create } from 'zustand'
import type { Session, TimelineItem, WebChatTargetId } from '@shared/types'

interface SessionStore {
  sessions: Session[]
  activeSession: Session | null
  timeline: TimelineItem[]
  workspacePath: string
  isLoading: boolean

  setSessions: (sessions: Session[]) => void
  setActiveSession: (session: Session | null) => void
  setTimeline: (timeline: TimelineItem[]) => void
  setWorkspacePath: (path: string) => void

  init: () => Promise<void>
  createSession: (targetId?: WebChatTargetId) => Promise<Session>
  selectSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  toggleAutoApprove: () => Promise<void>

  sendUserMessage: (text: string) => Promise<void>
  approveTool: (toolCallId: string) => Promise<void>
  rejectTool: (toolCallId: string) => Promise<void>
  abortAgent: () => Promise<void>
  respondToUserInput: (toolCallId: string, answer: string) => Promise<void>

  handleTimelineUpdate: (item: TimelineItem) => void
  handleSessionUpdate: (session: Session) => void
  handleTerminalChunk: (toolCallId: string, chunk: string) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSession: null,
  timeline: [],
  workspacePath: '/data/arts/ABPPAgent',
  isLoading: false,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setTimeline: (timeline) => set({ timeline }),
  setWorkspacePath: (workspacePath) => set({ workspacePath }),

  init: async () => {
    if (!window.agentApi) return
    const sessions = await window.agentApi.getSessions()
    set({ sessions })

    if (sessions.length > 0) {
      await get().selectSession(sessions[0].id)
    } else {
      await get().createSession()
    }

    // Subscribe to IPC events
    window.agentApi.onTimelineUpdate((item) => get().handleTimelineUpdate(item))
    window.agentApi.onSessionUpdate((session) => get().handleSessionUpdate(session))
    window.agentApi.onTerminalChunk(({ toolCallId, chunk }) => get().handleTerminalChunk(toolCallId, chunk))
  },

  createSession: async (targetId = 'deepseek') => {
    if (!window.agentApi) throw new Error('agentApi not available')
    const session = await window.agentApi.createSession(targetId, get().workspacePath)
    set((state) => ({ sessions: [session, ...state.sessions] }))
    await get().selectSession(session.id)
    return session
  },

  selectSession: async (sessionId: string) => {
    if (!window.agentApi) return
    set({ isLoading: true })
    try {
      const { session, timeline } = await window.agentApi.selectSession(sessionId)
      set({ activeSession: session, timeline, workspacePath: session.workspacePath })
    } finally {
      set({ isLoading: false })
    }
  },

  deleteSession: async (sessionId: string) => {
    if (!window.agentApi) return
    await window.agentApi.deleteSession(sessionId)
    const remaining = get().sessions.filter((s) => s.id !== sessionId)
    set({ sessions: remaining })
    if (get().activeSession?.id === sessionId) {
      if (remaining.length > 0) {
        await get().selectSession(remaining[0].id)
      } else {
        await get().createSession()
      }
    }
  },

  toggleAutoApprove: async () => {
    const { activeSession } = get()
    if (!activeSession || !window.agentApi) return
    const newAuto = !activeSession.autoApprove
    const updated = await window.agentApi.updateSessionSettings(activeSession.id, { autoApprove: newAuto })
    set({ activeSession: updated })
  },

  sendUserMessage: async (text: string) => {
    const { activeSession } = get()
    if (!activeSession || !window.agentApi) return
    await window.agentApi.sendUserMessage(activeSession.id, text)
  },

  approveTool: async (toolCallId: string) => {
    const { activeSession } = get()
    if (!activeSession || !window.agentApi) return
    await window.agentApi.approveToolCall(activeSession.id, toolCallId)
  },

  rejectTool: async (toolCallId: string) => {
    const { activeSession } = get()
    if (!activeSession || !window.agentApi) return
    await window.agentApi.rejectToolCall(activeSession.id, toolCallId)
  },

  abortAgent: async () => {
    const { activeSession } = get()
    if (!activeSession || !window.agentApi) return
    await window.agentApi.abortAgent(activeSession.id)
  },

  respondToUserInput: async (toolCallId: string, answer: string) => {
    const { activeSession } = get()
    if (!activeSession || !window.agentApi) return
    await window.agentApi.respondToUserInput(activeSession.id, `${toolCallId}:::${answer}`)
  },

  handleTimelineUpdate: (item: TimelineItem) => {
    const { activeSession, timeline } = get()
    if (activeSession && item.sessionId !== activeSession.id) return

    const index = timeline.findIndex((t) => t.id === item.id)
    if (index >= 0) {
      const next = [...timeline]
      next[index] = item
      set({ timeline: next })
    } else {
      set({ timeline: [...timeline, item] })
    }
  },

  handleSessionUpdate: (session: Session) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
      activeSession: state.activeSession?.id === session.id ? session : state.activeSession,
    }))
  },

  handleTerminalChunk: (toolCallId: string, chunk: string) => {
    set((state) => ({
      timeline: state.timeline.map((item) => {
        if (item.toolCall && item.toolCall.id === toolCallId) {
          return {
            ...item,
            toolCall: {
              ...item.toolCall,
              terminalStream: (item.toolCall.terminalStream || '') + chunk,
            },
          }
        }
        return item
      }),
    }))
  },
}))
