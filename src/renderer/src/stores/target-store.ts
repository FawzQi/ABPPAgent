import { create } from 'zustand'
import type { WebChatTargetId, WebChatTargetInfo } from '@shared/types'

interface TargetStore {
  targets: WebChatTargetInfo[]
  selectedTargetId: WebChatTargetId
  setTargets: (targets: WebChatTargetInfo[]) => void
  updateTargetStatus: (info: WebChatTargetInfo) => void
  setSelectedTargetId: (targetId: WebChatTargetId) => void
  refreshTargets: () => Promise<void>
  openTargetWindow: (targetId: WebChatTargetId) => Promise<void>
}

export const useTargetStore = create<TargetStore>((set, get) => ({
  targets: [
    { id: 'deepseek', label: 'DeepSeek (V3/R1)', url: 'https://chat.deepseek.com/', status: 'idle', isReady: false },
    { id: 'chatgpt', label: 'ChatGPT (4o/o1)', url: 'https://chatgpt.com/', status: 'idle', isReady: false },
    { id: 'gemini', label: 'Gemini (Advanced)', url: 'https://gemini.google.com/app', status: 'idle', isReady: false },
  ],
  selectedTargetId: 'deepseek',
  setTargets: (targets) => set({ targets }),
  updateTargetStatus: (info) =>
    set((state) => ({
      targets: state.targets.map((t) => (t.id === info.id ? { ...t, ...info } : t)),
    })),
  setSelectedTargetId: (selectedTargetId) => set({ selectedTargetId }),
  refreshTargets: async () => {
    if (window.agentApi) {
      const targets = await window.agentApi.getTargets()
      set({ targets })
    }
  },
  openTargetWindow: async (targetId) => {
    if (window.agentApi) {
      await window.agentApi.openTargetWindow(targetId)
      get().refreshTargets()
    }
  },
}))
