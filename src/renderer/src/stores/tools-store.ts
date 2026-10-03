import { create } from 'zustand'
import type { CustomToolsConfig } from '@shared/types'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '@shared/types'

interface ToolsStore {
  isOpen: boolean
  config: CustomToolsConfig
  loading: boolean
  openModal: () => void
  closeModal: () => void
  loadConfig: (sessionId: string) => Promise<void>
  toggleTool: (sessionId: string, toolKey: keyof CustomToolsConfig) => Promise<void>
  setConfig: (sessionId: string, newConfig: CustomToolsConfig) => Promise<void>
}

export const useToolsStore = create<ToolsStore>((set, get) => ({
  isOpen: false,
  config: { ...DEFAULT_CUSTOM_TOOLS_CONFIG },
  loading: false,

  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),

  loadConfig: async (sessionId: string) => {
    if (!sessionId || !window.agentApi) return
    set({ loading: true })
    try {
      const cfg = await window.agentApi.getCustomTools(sessionId)
      set({ config: cfg, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  toggleTool: async (sessionId: string, toolKey: keyof CustomToolsConfig) => {
    const current = get().config
    const updated = { ...current, [toolKey]: !current[toolKey] }
    set({ config: updated })
    if (sessionId && window.agentApi) {
      await window.agentApi.updateCustomTools(sessionId, updated)
    }
  },

  setConfig: async (sessionId: string, newConfig: CustomToolsConfig) => {
    set({ config: newConfig })
    if (sessionId && window.agentApi) {
      await window.agentApi.updateCustomTools(sessionId, newConfig)
    }
  },
}))
