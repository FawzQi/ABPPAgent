export type WebChatTargetId = 'deepseek' | 'chatgpt' | 'claude' | 'gemini' | 'kimi' | 'qwen'

export type WebChatStatus = 'idle' | 'working' | 'paused' | 'error' | 'disconnected'

export interface WebChatTargetInfo {
  id: WebChatTargetId
  label: string
  url: string
  status?: WebChatStatus
  statusDetails?: string
  lastActive?: number
  isReady?: boolean
}

export interface WebChatSendResult {
  ok: boolean
  text?: string
  error?: string
}

export interface WebChatResponsePushedPayload {
  target: WebChatTargetId
  text: string
  isDirectPush?: boolean
}

export type ToolApprovalStatus = 'auto_approved' | 'pending' | 'approved' | 'rejected'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
  rawXml?: string
}

export interface ToolResult {
  toolCallId: string
  name: string
  output: string
  isError?: boolean
  diffPreview?: string
  exitCode?: number
}

export interface ThinkingBlock {
  content: string
  durationMs?: number
  isStreaming?: boolean
}

export interface DiffInfo {
  filePath: string
  oldContent: string
  newContent: string
  additions: number
  deletions: number
}

// Git Types
export type GitFileStatusCode = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'conflicted'

export interface GitFileChange {
  path: string
  status: GitFileStatusCode
  oldPath?: string
}

export interface GitStatus {
  branch: string | null
  ahead: number
  behind: number
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
  conflicted: GitFileChange[]
}

export interface GitDiffContent {
  original: string
  modified: string
  exists: boolean
}

export interface GitCommitResult {
  commitHash: string
  summary: string
}

// Custom Tools Configuration
export interface CustomToolsConfig {
  enableGitnexus: boolean
  enableGrep: boolean
  enableFullFile: boolean
  enableRunCommand: boolean
  enableFileMutation: boolean
}

export const DEFAULT_CUSTOM_TOOLS_CONFIG: CustomToolsConfig = {
  enableGitnexus: true,
  enableGrep: true,
  enableFullFile: true,
  enableRunCommand: true,
  enableFileMutation: true,
}

export interface TimelineItem {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool'
  content?: string
  thinking?: ThinkingBlock
  toolCall?: {
    id: string
    name: string
    args: Record<string, any>
    status: ToolApprovalStatus
    result?: ToolResult
    terminalStream?: string
    diff?: DiffInfo
  }
  userInputRequest?: {
    question: string
    options?: string[]
  }
  timestamp: number
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  targetId: WebChatTargetId
  workspacePath: string
  autoApprove: boolean
  status: 'idle' | 'running' | 'paused' | 'error'
  customTools?: CustomToolsConfig
}

export interface WorkspaceFileChange {
  path: string
  status: 'modified' | 'added' | 'deleted'
  additions: number
  deletions: number
  oldContent?: string
  newContent?: string
}

export interface AgentApi {
  // Session management
  getSessions: () => Promise<Session[]>
  createSession: (targetId: WebChatTargetId, workspacePath: string, title?: string) => Promise<Session>
  selectSession: (sessionId: string) => Promise<{ session: Session; timeline: TimelineItem[] }>
  deleteSession: (sessionId: string) => Promise<boolean>
  updateSessionSettings: (sessionId: string, updates: Partial<Session>) => Promise<Session>

  // Targets & Web Chat
  getTargets: () => Promise<WebChatTargetInfo[]>
  openTargetWindow: (targetId: WebChatTargetId) => Promise<boolean>
  setTargetActive: (targetId: WebChatTargetId) => Promise<boolean>

  // Agent execution
  sendUserMessage: (sessionId: string, text: string) => Promise<void>
  approveToolCall: (sessionId: string, toolCallId: string) => Promise<void>
  rejectToolCall: (sessionId: string, toolCallId: string, reason?: string) => Promise<void>
  respondToUserInput: (sessionId: string, response: string) => Promise<void>
  abortAgent: (sessionId: string) => Promise<void>

  // Workspace
  selectWorkspaceFolder: () => Promise<string | null>
  getWorkspaceTree: (dirPath?: string) => Promise<{ path: string; name: string; isDir: boolean }[]>
  getFileContent: (filePath: string) => Promise<string>
  getModifiedFiles: (sessionId: string) => Promise<WorkspaceFileChange[]>

  // Git & Source Control
  gitGetStatus: (projectRoot: string) => Promise<GitStatus | null>
  gitStageFile: (projectRoot: string, relativePath: string) => Promise<void>
  gitStageAll: (projectRoot: string) => Promise<void>
  gitUnstageFile: (projectRoot: string, relativePath: string) => Promise<void>
  gitDiscardFile: (projectRoot: string, relativePath: string) => Promise<void>
  gitDiscardAll: (projectRoot: string) => Promise<void>
  gitCommit: (projectRoot: string, message: string) => Promise<GitCommitResult>
  gitDiff: (projectRoot: string, relativePath: string, staged: boolean) => Promise<GitDiffContent>
  gitInit: (projectRoot: string) => Promise<{ created: boolean }>

  // Custom Tools Settings
  updateCustomTools: (sessionId: string, config: CustomToolsConfig) => Promise<CustomToolsConfig>
  getCustomTools: (sessionId: string) => Promise<CustomToolsConfig>

  // Events / Listeners
  onTimelineUpdate: (callback: (item: TimelineItem) => void) => () => void
  onSessionUpdate: (callback: (session: Session) => void) => () => void
  onTargetStatusUpdate: (callback: (info: WebChatTargetInfo) => void) => () => void
  onTerminalChunk: (callback: (data: { toolCallId: string; chunk: string }) => void) => () => void
  onAgentStatusChange: (callback: (data: { sessionId: string; status: Session['status'] }) => void) => () => void
}

declare global {
  interface Window {
    agentApi: AgentApi
  }
}

