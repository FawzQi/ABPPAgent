import fs from 'node:fs'
import { dialog, ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Session, WebChatTargetId, WebChatTargetInfo } from '@shared/types'
import { SessionRepository } from './services/db/repository'
import { WEB_CHAT_TARGETS } from './services/web-chat/targets'
import { WindowPool } from './services/web-chat/window-pool'
import { StatusPoller } from './services/web-chat/poller'
import { AgentOrchestrator } from './services/agent/orchestrator'
import { DirectoryExplorer } from './services/tools/explorer'

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

  // Setup status poller listener
  StatusPoller.subscribe((targetId, status) => {
    const target = WEB_CHAT_TARGETS.find((t) => t.id === targetId)
    if (target) {
      broadcast(IPC_CHANNELS.EVENT_TARGET_STATUS_UPDATE, {
        id: target.id,
        label: target.label,
        url: target.url,
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
    const session: Session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title || `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetId,
      workspacePath,
      autoApprove: false,
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
    return SessionRepository.deleteSession(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_SESSION_SETTINGS, (_e, sessionId: string, updates: Partial<Session>) => {
    const session = SessionRepository.getSessionById(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const updated = { ...session, ...updates, updatedAt: Date.now() }
    SessionRepository.saveSession(updated)
    return updated
  })

  // 2. Targets
  ipcMain.handle(IPC_CHANNELS.GET_TARGETS, (): WebChatTargetInfo[] => {
    return WEB_CHAT_TARGETS.map((t) => ({
      id: t.id,
      label: t.label,
      url: t.url,
      status: StatusPoller.getStatus(t.id),
      isReady: Boolean(WindowPool.getWindow(t.id)),
    }))
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_TARGET_WINDOW, async (_e, targetId: WebChatTargetId) => {
    await WindowPool.ensureWindow(targetId, true)
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
    // If pending input exists, pass response
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
}
