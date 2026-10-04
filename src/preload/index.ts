import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { AgentApi, Session, TimelineItem, WebChatTargetId, WebChatTargetInfo, WorkspaceFileChange } from '@shared/types'

const agentApi: AgentApi = {
  getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),
  createSession: (targetId: WebChatTargetId, workspacePath: string, title?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, targetId, workspacePath, title),
  selectSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.SELECT_SESSION, sessionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_SESSION, sessionId),
  updateSessionSettings: (sessionId: string, updates: Partial<Session>) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SESSION_SETTINGS, sessionId, updates),

  getTargets: () => ipcRenderer.invoke(IPC_CHANNELS.GET_TARGETS),
  openTargetWindow: (targetId: WebChatTargetId) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_TARGET_WINDOW, targetId),
  setTargetActive: (targetId: WebChatTargetId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_TARGET_ACTIVE, targetId),

  sendUserMessage: (sessionId: string, text: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_USER_MESSAGE, sessionId, text),
  approveToolCall: (sessionId: string, toolCallId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.APPROVE_TOOL_CALL, sessionId, toolCallId),
  rejectToolCall: (sessionId: string, toolCallId: string, reason?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REJECT_TOOL_CALL, sessionId, toolCallId, reason),
  respondToUserInput: (sessionId: string, response: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RESPOND_TO_USER_INPUT, sessionId, response),
  abortAgent: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.ABORT_AGENT, sessionId),

  selectWorkspaceFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_WORKSPACE_FOLDER),
  getWorkspaceTree: (dirPath?: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_WORKSPACE_TREE, dirPath),
  getFileContent: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_CONTENT, filePath),
  getModifiedFiles: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_MODIFIED_FILES, sessionId),

  // Git & Source Control
  gitGetStatus: (projectRoot: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STATUS, projectRoot),
  gitStageFile: (projectRoot: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE_FILE, projectRoot, relativePath),
  gitStageAll: (projectRoot: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE_ALL, projectRoot),
  gitUnstageFile: (projectRoot: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE_FILE, projectRoot, relativePath),
  gitDiscardFile: (projectRoot: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD_FILE, projectRoot, relativePath),
  gitDiscardAll: (projectRoot: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD_ALL, projectRoot),
  gitCommit: (projectRoot: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, projectRoot, message),
  gitDiff: (projectRoot: string, relativePath: string, staged: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, projectRoot, relativePath, staged),
  gitInit: (projectRoot: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_INIT, projectRoot),

  // Custom Tools Settings
  updateCustomTools: (sessionId: string, config: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CUSTOM_TOOLS, sessionId, config),
  getCustomTools: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CUSTOM_TOOLS, sessionId),

  // File Suggestion & AI Settings
  getFileSuggestionSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_SUGGESTION_SETTINGS),
  saveFileSuggestionSettings: (updates: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE_SUGGESTION_SETTINGS, updates),
  getAiProviders: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_AI_PROVIDERS),

  onTimelineUpdate: (callback: (item: TimelineItem) => void) => {
    const handler = (_event: any, item: TimelineItem) => callback(item)
    ipcRenderer.on(IPC_CHANNELS.EVENT_TIMELINE_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TIMELINE_UPDATE, handler)
  },
  onSessionUpdate: (callback: (session: Session) => void) => {
    const handler = (_event: any, session: Session) => callback(session)
    ipcRenderer.on(IPC_CHANNELS.EVENT_SESSION_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_SESSION_UPDATE, handler)
  },
  onTargetStatusUpdate: (callback: (info: WebChatTargetInfo) => void) => {
    const handler = (_event: any, info: WebChatTargetInfo) => callback(info)
    ipcRenderer.on(IPC_CHANNELS.EVENT_TARGET_STATUS_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TARGET_STATUS_UPDATE, handler)
  },
  onTerminalChunk: (callback: (data: { toolCallId: string; chunk: string }) => void) => {
    const handler = (_event: any, data: { toolCallId: string; chunk: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.EVENT_TERMINAL_CHUNK, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_TERMINAL_CHUNK, handler)
  },
  onAgentStatusChange: (callback: (data: { sessionId: string; status: Session['status'] }) => void) => {
    const handler = (_event: any, data: { sessionId: string; status: Session['status'] }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.EVENT_AGENT_STATUS_CHANGE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_AGENT_STATUS_CHANGE, handler)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('agentApi', agentApi)
  } catch (error) {
    console.error('Failed to expose agentApi in main world:', error)
  }
} else {
  // @ts-ignore fallback
  window.agentApi = agentApi
}
