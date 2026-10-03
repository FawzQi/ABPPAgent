import { create } from 'zustand'
import type { GitDiffContent, GitStatus } from '@shared/types'

export interface SelectedGitDiff {
  path: string
  staged: boolean
  content?: GitDiffContent
  loading?: boolean
  error?: string
}

interface GitStore {
  projectRoot: string
  gitStatus: GitStatus | null | undefined
  gitStatusLoading: boolean
  gitBusy: boolean
  gitCommitMessage: string
  selectedDiff: SelectedGitDiff | null
  error: string | null

  setProjectRoot: (root: string) => void
  setGitCommitMessage: (msg: string) => void
  setSelectedDiff: (diff: SelectedGitDiff | null) => void
  refreshGitStatus: () => Promise<void>
  initGitRepo: () => Promise<void>
  stageFile: (relativePath: string) => Promise<void>
  stageAll: () => Promise<void>
  unstageFile: (relativePath: string) => Promise<void>
  discardFile: (relativePath: string) => Promise<void>
  discardAll: () => Promise<void>
  commitChanges: () => Promise<boolean>
  loadDiff: (relativePath: string, staged: boolean) => Promise<void>
}

export const useGitStore = create<GitStore>((set, get) => ({
  projectRoot: '',
  gitStatus: undefined,
  gitStatusLoading: false,
  gitBusy: false,
  gitCommitMessage: '',
  selectedDiff: null,
  error: null,

  setProjectRoot: (projectRoot: string) => {
    set({ projectRoot, gitStatus: undefined, selectedDiff: null, error: null })
    if (projectRoot) {
      void get().refreshGitStatus()
    }
  },

  setGitCommitMessage: (gitCommitMessage: string) => set({ gitCommitMessage }),
  setSelectedDiff: (selectedDiff) => set({ selectedDiff }),

  refreshGitStatus: async () => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ gitStatusLoading: true, error: null })
    try {
      const status = await window.agentApi.gitGetStatus(projectRoot)
      set({ gitStatus: status, gitStatusLoading: false })
    } catch (err: any) {
      set({ gitStatus: null, gitStatusLoading: false, error: err.message })
    }
  },

  initGitRepo: async () => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ gitBusy: true, error: null })
    try {
      await window.agentApi.gitInit(projectRoot)
      await get().refreshGitStatus()
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ gitBusy: false })
    }
  },

  stageFile: async (relativePath: string) => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ gitBusy: true })
    try {
      await window.agentApi.gitStageFile(projectRoot, relativePath)
      await get().refreshGitStatus()
      if (get().selectedDiff?.path === relativePath) {
        await get().loadDiff(relativePath, true)
      }
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ gitBusy: false })
    }
  },

  stageAll: async () => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ gitBusy: true })
    try {
      await window.agentApi.gitStageAll(projectRoot)
      await get().refreshGitStatus()
      const current = get().selectedDiff
      if (current) {
        await get().loadDiff(current.path, true)
      }
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ gitBusy: false })
    }
  },

  unstageFile: async (relativePath: string) => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ gitBusy: true })
    try {
      await window.agentApi.gitUnstageFile(projectRoot, relativePath)
      await get().refreshGitStatus()
      if (get().selectedDiff?.path === relativePath) {
        await get().loadDiff(relativePath, false)
      }
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ gitBusy: false })
    }
  },

  discardFile: async (relativePath: string) => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ gitBusy: true })
    try {
      await window.agentApi.gitDiscardFile(projectRoot, relativePath)
      await get().refreshGitStatus()
      if (get().selectedDiff?.path === relativePath) {
        set({ selectedDiff: null })
      }
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ gitBusy: false })
    }
  },

  discardAll: async () => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ gitBusy: true })
    try {
      await window.agentApi.gitDiscardAll(projectRoot)
      await get().refreshGitStatus()
      set({ selectedDiff: null })
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ gitBusy: false })
    }
  },

  commitChanges: async () => {
    const { projectRoot, gitCommitMessage } = get()
    if (!projectRoot || !gitCommitMessage.trim() || !window.agentApi) return false
    set({ gitBusy: true, error: null })
    try {
      await window.agentApi.gitCommit(projectRoot, gitCommitMessage.trim())
      set({ gitCommitMessage: '', selectedDiff: null })
      await get().refreshGitStatus()
      return true
    } catch (err: any) {
      set({ error: err.message })
      return false
    } finally {
      set({ gitBusy: false })
    }
  },

  loadDiff: async (relativePath: string, staged: boolean) => {
    const { projectRoot } = get()
    if (!projectRoot || !window.agentApi) return
    set({ selectedDiff: { path: relativePath, staged, loading: true } })
    try {
      const content = await window.agentApi.gitDiff(projectRoot, relativePath, staged)
      set({ selectedDiff: { path: relativePath, staged, content, loading: false } })
    } catch (err: any) {
      set({ selectedDiff: { path: relativePath, staged, error: err.message, loading: false } })
    }
  },
}))
