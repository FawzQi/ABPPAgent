import { create } from 'zustand'
import type { WorkspaceFileChange } from '@shared/types'

interface DiffStore {
  modifiedFiles: WorkspaceFileChange[]
  selectedFile: WorkspaceFileChange | null
  setModifiedFiles: (files: WorkspaceFileChange[]) => void
  setSelectedFile: (file: WorkspaceFileChange | null) => void
  loadModifiedFiles: (sessionId: string) => Promise<void>
}

export const useDiffStore = create<DiffStore>((set) => ({
  modifiedFiles: [],
  selectedFile: null,
  setModifiedFiles: (modifiedFiles) => set({ modifiedFiles }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  loadModifiedFiles: async (sessionId: string) => {
    if (!window.agentApi) return
    const files = await window.agentApi.getModifiedFiles(sessionId)
    set({ modifiedFiles: files })
    if (files.length > 0) {
      set({ selectedFile: files[0] })
    }
  },
}))
