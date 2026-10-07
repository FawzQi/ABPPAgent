import fs from 'node:fs'
import { dialog, ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Session, WebChatTargetId, WebChatTargetInfo, CustomToolsConfig } from '@shared/types'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '@shared/types'
import { SessionRepository } from './services/db/repository'
import {
  listWebChatTargets,
  getWebChatStatuses,
  setWebChatStatusListener,
  openWebChat,
} from './services/web-chat/web-chat-service'
import { AgentOrchestrator } from './services/agent/orchestrator'
import { DirectoryExplorer } from './services/tools/explorer'
import * as GitService from './services/git/git-service'
import { getFileSuggestionSettings, saveFileSuggestionSettings } from './services/agent/ai-settings'
import { listProviders } from './services/agent/ai-providers'
import { getBasePrompt, saveBasePrompt, resetBasePrompt } from './services/agent/base-prompt'
import { clearSessionState } from './services/agent/workspace-state'

export function registerIpcHandlers(): void {
  // Broadcast helper
  const broadcast = (channel: string, payload: any) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
  }

  // Setup orchestrator callbacks
  AgentOrchestrator.setCallbacks({
    onTimelineUpdate: (item) => broadcast(IPC_CHANNELS.EVENT_TIMELINE_UPDATE, item),
    onSessionUpdate: (session) => broadcast(IPC_CHANNELS.EVENT_SESSION_UPDATE, session),
    onTerminalChunk: (data) => broadcast(IPC_CHANNELS.EVENT_TERMINAL_CHUNK, data),
  })

  // Setup status poller listener from web-chat-service
  setWebChatStatusListener((statuses) => {
    const targets = listWebChatTargets()
    for (const target of targets) {
      const status = statuses[target.id] ?? 'idle'
      broadcast(IPC_CHANNELS.EVENT_TARGET_STATUS_UPDATE, {
        ...target,
        status,
        isReady: true,
      })
    }
  })

  // 1. Sessions
  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, () => {
    return SessionRepository.getSessions()
  })

  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, (_e, targetId: WebChatTargetId, workspacePath: string, title?: string) => {
    const defaults = SessionRepository.getSessionDefaults()
    const session: Session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title || `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetId,
      workspacePath,
      autoApprove: defaults.autoApprove,
      delays: defaults.delays,
      customTools: defaults.customTools,
      status: 'idle',
    }
    SessionRepository.saveSession(session)
    return session
  })

  ipcMain.handle(IPC_CHANNELS.SELECT_SESSION, (_e, sessionId: string) => {
    const session = SessionRepository.getSessionById(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const timeline = SessionRepository.getTimeline(sessionId)
    return { session, timeline }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_SESSION, (_e, sessionId: string) => {
    clearSessionState(sessionId)
    return SessionRepository.deleteSession(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_SESSION_SETTINGS, (_e, sessionId: string, updates: Partial<Session>) => {
    const session = SessionRepository.getSessionById(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const updated = { ...session, ...updates, updatedAt: Date.now() }
    SessionRepository.saveSession(updated)

    const defaultsUpdate: any = {}
    const syncUpdates: Partial<Session> = {}
    if (updates.autoApprove !== undefined) {
      defaultsUpdate.autoApprove = updates.autoApprove
      syncUpdates.autoApprove = updates.autoApprove
    }
    if (updates.delays !== undefined) {
      defaultsUpdate.delays = updates.delays
      syncUpdates.delays = updates.delays
    }
    if (Object.keys(defaultsUpdate).length > 0) {
      SessionRepository.saveSessionDefaults(defaultsUpdate)
      SessionRepository.updateAllSessions(syncUpdates)
    }

    return updated
  })

  // 2. Targets
  ipcMain.handle(IPC_CHANNELS.GET_TARGETS, (): WebChatTargetInfo[] => {
    const statuses = getWebChatStatuses()
    return listWebChatTargets().map((t) => ({
      ...t,
      status: statuses[t.id] ?? 'idle',
      isReady: true,
    }))
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_TARGET_WINDOW, async (_e, targetId: WebChatTargetId) => {
    await openWebChat(targetId)
    return true
  })

  // 3. Execution
  ipcMain.handle(IPC_CHANNELS.SEND_USER_MESSAGE, async (_e, sessionId: string, text: string) => {
    AgentOrchestrator.handleUserMessage(sessionId, text).catch((err) => {
      console.error('Agent execution error:', err)
    })
  })

  ipcMain.handle(IPC_CHANNELS.APPROVE_TOOL_CALL, (_e, _sessionId: string, toolCallId: string) => {
    AgentOrchestrator.approveToolCall(toolCallId)
  })

  ipcMain.handle(IPC_CHANNELS.REJECT_TOOL_CALL, (_e, _sessionId: string, toolCallId: string) => {
    AgentOrchestrator.rejectToolCall(toolCallId)
  })

  ipcMain.handle(IPC_CHANNELS.RESPOND_TO_USER_INPUT, (_e, _sessionId: string, answer: string) => {
    const parts = answer.split(':::')
    if (parts.length === 2) {
      AgentOrchestrator.respondToUserInput(parts[0], parts[1])
    }
  })

  ipcMain.handle(IPC_CHANNELS.ABORT_AGENT, (_e, sessionId: string) => {
    AgentOrchestrator.abortAgent(sessionId)
  })

  // 4. Workspace
  ipcMain.handle(IPC_CHANNELS.SELECT_WORKSPACE_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE_TREE, (_e, dirPath?: string) => {
    const target = dirPath || process.cwd()
    return DirectoryExplorer.getDirectoryTree(target)
  })

  ipcMain.handle(IPC_CHANNELS.GET_FILE_CONTENT, (_e, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8')
      }
      return ''
    } catch {
      return ''
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_MODIFIED_FILES, (_e, sessionId: string) => {
    return SessionRepository.getModifiedFiles(sessionId)
  })

  // 5. Git & Source Control
  ipcMain.handle(IPC_CHANNELS.GIT_GET_STATUS, async (_e, projectRoot: string) => {
    return GitService.getStatus(projectRoot)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE_FILE, async (_e, projectRoot: string, relativePath: string) => {
    return GitService.stageFile(projectRoot, relativePath)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE_ALL, async (_e, projectRoot: string) => {
    return GitService.stageAllFiles(projectRoot)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE_FILE, async (_e, projectRoot: string, relativePath: string) => {
    return GitService.unstageFile(projectRoot, relativePath)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD_FILE, async (_e, projectRoot: string, relativePath: string) => {
    return GitService.discardFile(projectRoot, relativePath)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD_ALL, async (_e, projectRoot: string) => {
    return GitService.discardAllFiles(projectRoot)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (_e, projectRoot: string, message: string) => {
    return GitService.commitChanges(projectRoot, message)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF, async (_e, projectRoot: string, relativePath: string, staged: boolean) => {
    return GitService.getDiffContent(projectRoot, relativePath, staged)
  })

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (_e, projectRoot: string) => {
    return GitService.initRepository(projectRoot)
  })

  // 6. Custom Tools Settings
  ipcMain.handle(IPC_CHANNELS.UPDATE_CUSTOM_TOOLS, async (_e, sessionId: string, config: CustomToolsConfig) => {
    const session = SessionRepository.getSessionById(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    session.customTools = config
    session.updatedAt = Date.now()
    SessionRepository.saveSession(session)

    SessionRepository.saveSessionDefaults({ customTools: config })
    SessionRepository.updateAllSessions({ customTools: config })

    broadcast(IPC_CHANNELS.EVENT_SESSION_UPDATE, session)
    return config
  })

  ipcMain.handle(IPC_CHANNELS.GET_CUSTOM_TOOLS, async (_e, sessionId: string) => {
    const session = SessionRepository.getSessionById(sessionId)
    return session?.customTools || SessionRepository.getSessionDefaults().customTools
  })

  // 7. File Suggestion & AI Settings
  ipcMain.handle(IPC_CHANNELS.GET_FILE_SUGGESTION_SETTINGS, async () => {
    return getFileSuggestionSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_FILE_SUGGESTION_SETTINGS, async (_e, updates: any) => {
    return saveFileSuggestionSettings(updates)
  })

  ipcMain.handle(IPC_CHANNELS.GET_AI_PROVIDERS, async () => {
    return listProviders()
  })

  // 8. Base Prompt Settings
  ipcMain.handle(IPC_CHANNELS.GET_BASE_PROMPT, async () => {
    return getBasePrompt()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_BASE_PROMPT, async (_e, prompt: string) => {
    saveBasePrompt(prompt)
    return getBasePrompt()
  })

  ipcMain.handle(IPC_CHANNELS.RESET_BASE_PROMPT, async () => {
    resetBasePrompt()
    return getBasePrompt()
  })
}

