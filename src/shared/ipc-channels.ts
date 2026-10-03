export const IPC_CHANNELS = {
  // Sessions
  GET_SESSIONS: 'agent:get-sessions',
  CREATE_SESSION: 'agent:create-session',
  SELECT_SESSION: 'agent:select-session',
  DELETE_SESSION: 'agent:delete-session',
  UPDATE_SESSION_SETTINGS: 'agent:update-session-settings',

  // Targets
  GET_TARGETS: 'agent:get-targets',
  OPEN_TARGET_WINDOW: 'agent:open-target-window',
  SET_TARGET_ACTIVE: 'agent:set-target-active',

  // Execution
  SEND_USER_MESSAGE: 'agent:send-user-message',
  APPROVE_TOOL_CALL: 'agent:approve-tool-call',
  REJECT_TOOL_CALL: 'agent:reject-tool-call',
  RESPOND_TO_USER_INPUT: 'agent:respond-to-user-input',
  ABORT_AGENT: 'agent:abort-agent',

  // Workspace
  SELECT_WORKSPACE_FOLDER: 'agent:select-workspace-folder',
  GET_WORKSPACE_TREE: 'agent:get-workspace-tree',
  GET_FILE_CONTENT: 'agent:get-file-content',
  GET_MODIFIED_FILES: 'agent:get-modified-files',

  // Git & Source Control
  GIT_GET_STATUS: 'agent:git-get-status',
  GIT_STAGE_FILE: 'agent:git-stage-file',
  GIT_STAGE_ALL: 'agent:git-stage-all',
  GIT_UNSTAGE_FILE: 'agent:git-unstage-file',
  GIT_DISCARD_FILE: 'agent:git-discard-file',
  GIT_DISCARD_ALL: 'agent:git-discard-all',
  GIT_COMMIT: 'agent:git-commit',
  GIT_DIFF: 'agent:git-diff',
  GIT_INIT: 'agent:git-init',

  // Custom Tools Settings
  UPDATE_CUSTOM_TOOLS: 'agent:update-custom-tools',
  GET_CUSTOM_TOOLS: 'agent:get-custom-tools',

  // Push Events (Main -> Renderer)
  EVENT_TIMELINE_UPDATE: 'agent-event:timeline-update',
  EVENT_SESSION_UPDATE: 'agent-event:session-update',
  EVENT_TARGET_STATUS_UPDATE: 'agent-event:target-status-update',
  EVENT_TERMINAL_CHUNK: 'agent-event:terminal-chunk',
  EVENT_AGENT_STATUS_CHANGE: 'agent-event:status-change',
} as const
