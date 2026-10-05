import path from 'node:path'
import type { Session, TimelineItem, ToolCall, ToolResult } from '@shared/types'
import { SessionRepository } from '../db/repository'
import { sendToWebChat, cancelWebChat } from '../web-chat/web-chat-service'
import { ToolCallParser } from './parser'
import { PermissionGateway } from './permissions'
import { buildSystemPrompt, appendToolJsonFormatRule, buildToolFormatWarningPrompt } from './prompt'
import { ProcessRunner } from '../tools/runner'
import { FilesystemTools } from '../tools/filesystem'
import { DirectoryExplorer } from '../tools/explorer'
import { CustomToolsService, getExtendedEnv } from '../tools/custom-tools'
import { generateCodebaseContext } from './codebase-context'
import { validateCall, checkReread, fileInfo, forget, typecheck } from './workspace-state'

export interface OrchestratorCallbacks {
  onTimelineUpdate: (item: TimelineItem) => void
  onSessionUpdate: (session: Session) => void
  onTerminalChunk: (data: { toolCallId: string; chunk: string }) => void
}

const JSON_FORMAT_EXAMPLE = `{
  "thought": "why I am doing this",
  "tool_call_name": "read_file",
  "parameter": { "AbsolutePath": "src/App.tsx" }
}`

/** Recovery prompt: restates the strict JSON turn format. Sent only when a turn is unusable. */
function formatErrorPrompt(problem?: string): string {
  return `# Tool Call Format Error\n${problem ?? 'Your previous message could not be parsed as a tool call.'}\n\nReply with a JSON object (or JSON array for batched tool calls):\n\`\`\`json\n${JSON_FORMAT_EXAMPLE}\n\`\`\`\nTo end the task: \`{"thought": "...", "tool_call_name": "finish", "parameter": {"summary": "..."}}\``
}

export class AgentDoubtDetector {
  private static DOUBT_PATTERNS = [
    /tools?\s+(?:are|is)\s+no\s+longer\s+available/i,
    /only\s+have\s+(?:web|search)\s+tools/i,
    /current\s+toolset\s+only\s+exposes/i,
    /no\s+longer\s+available\s+to\s+me/i,
    /cannot\s+read\s+(?:back\s+)?(?:the\s+)?file/i,
    /cannot\s+verify\s+or\s+write/i,
    /don't\s+have\s+file\s+tools/i,
    /lacks?\s+file\s+tools/i,
    /could\s+you\s+(?:run|paste|execute)\s*[:\s]+(?:wc|head|git|cat|bash|ls|npm)/i,
    /please\s+(?:run|paste|execute)\s*[:\s]+(?:wc|head|git|cat|bash|ls|npm)/i,
    /run\s+(?:wc\s+-|head\s+-|git\s+checkout|git\s+status|git\s+diff)/i,
    /restore\s+the\s+affected\s+files\s+from\s+git/i,
  ]

  static hasDoubtOrHelplessness(text: string): boolean {
    return this.DOUBT_PATTERNS.some((p) => p.test(text))
  }
}

export class AgentIntentDetector {
  private static COMPLETION_PATTERNS = [
    /\b(task is completed|all changes have been made|successfully (?:updated|implemented|fixed|created|resolved)|i have finished|everything is set up|the task is done|here is the summary|summary of changes)\b/i,
  ]

  private static INTENT_PATTERNS = [
    /\b(?:(?:now\s+)?let\s+me|i\s+will|i'll|i\s+need\s+to|let's|going\s+to|starting\s+to)\s+(?:read|explore|search|check|look|inspect|open|run|find|examine|update|modify|edit|write|implement|start)\b/i,
    /\b(?:first|next|now),?\s+(?:i\s+will|let's|let\s+me)\b/i,
    /\b(?:i\s+am|i'm|i\s+will)\s+(?:working|looking|checking|exploring|inspecting|preparing)\b/i,
  ]

  /**
   * Detects whether an assistant message without tool calls is vague or an unfulfilled
   * statement of intent to use tools or explore the codebase (rather than a finished result).
   */
  static isVagueOrUnfulfilled(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) return true

    // If it clearly announces completion, it is NOT an unfulfilled action
    if (this.COMPLETION_PATTERNS.some((p) => p.test(trimmed))) {
      return false
    }

    // 1. Ends with a colon (e.g. "Now let me read the PersonModal component to understand the card info layout:")
    if (/:$/.test(trimmed)) {
      return true
    }

    // 2. Action verbs indicating immediate exploration/tool invocation
    if (this.INTENT_PATTERNS.some((p) => p.test(trimmed))) {
      return true
    }

    // 3. Short conversational response without substance or tool invocation
    if (
      trimmed.length < 250 &&
      /\b(?:okay|sure|understood|working on|on it|take a look|let me|i will|i'll|starting|explore|select the tools)\b/i.test(
        trimmed,
      )
    ) {
      return true
    }

    return false
  }

  // Alias for backward-compatibility
  static isUnfulfilledAction(text: string): boolean {
    return this.isVagueOrUnfulfilled(text)
  }
}

export class AgentOrchestrator {
  private static runner = new ProcessRunner()
  private static activeSessions = new Map<string, { abortController: AbortController }>()
  private static pendingApprovals = new Map<string, { sessionId: string; resolve: (approved: boolean) => void }>()
  private static pendingUserInputs = new Map<string, { sessionId: string; resolve: (answer: string) => void }>()
  private static callbacks?: OrchestratorCallbacks

  static setCallbacks(callbacks: OrchestratorCallbacks): void {
    this.callbacks = callbacks
  }

  /**
   * Start a new agent run with a user prompt.
   */
  static async handleUserMessage(sessionId: string, userText: string): Promise<void> {
    const session = SessionRepository.getSessionById(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    // Save user message to timeline
    const userItem: TimelineItem = {
      id: `msg_${Date.now()}_u`,
      sessionId,
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    }
    SessionRepository.saveTimelineItem(userItem)
    this.callbacks?.onTimelineUpdate(userItem)

    // Update session status
    session.status = 'running'
    session.updatedAt = Date.now()
    SessionRepository.saveSession(session)
    this.callbacks?.onSessionUpdate(session)

    const abortController = new AbortController()
    this.activeSessions.set(sessionId, { abortController })

    // Check if this is turn 1 (first user prompt in session)
    const existingTimeline = SessionRepository.getTimeline(sessionId)
    const isFirstTurn = existingTimeline.filter((t) => t.role === 'user').length <= 1

    let promptToSend = userText

    // Generate codebase context (GitNexus + BM25 + recency) for basis context on every user prompt
    const codebaseContext = await generateCodebaseContext(session.workspacePath, userText)

    if (isFirstTurn) {
      const sysPrompt = buildSystemPrompt(session.workspacePath, codebaseContext || undefined, session.customTools)
      promptToSend = `${sysPrompt}\n\n# User Goal\n${userText}`
    } else if (codebaseContext) {
      promptToSend = `${codebaseContext}\n\n# User Goal\n${userText}`
    } else {
      promptToSend = `# User Goal\n${userText}`
    }

    // Append mandatory tool JSON format rule to the bottom of the prompt
    promptToSend = appendToolJsonFormatRule(promptToSend)

    try {
      await this.runLoop(session, promptToSend, abortController.signal)
    } catch (err: any) {
      if (abortController.signal.aborted) {
        session.status = 'paused'
      } else {
        session.status = 'error'
        const errorItem: TimelineItem = {
          id: `msg_${Date.now()}_err`,
          sessionId,
          role: 'assistant',
          content: `⚠️ Error during execution: ${err.message}`,
          timestamp: Date.now(),
        }
        SessionRepository.saveTimelineItem(errorItem)
        this.callbacks?.onTimelineUpdate(errorItem)
      }
      SessionRepository.saveSession(session)
      this.callbacks?.onSessionUpdate(session)
    } finally {
      this.activeSessions.delete(sessionId)
      if (abortController.signal.aborted) {
        // runLoop exits via `break` on abort, so status must be reset here or the UI stays 'running'
        session.status = 'idle'
        session.updatedAt = Date.now()
        const stopItem: TimelineItem = {
          id: `msg_${Date.now()}_stopped`,
          sessionId,
          role: 'assistant',
          content: '⏹ Stopped by user.',
          timestamp: Date.now(),
        }
        SessionRepository.saveTimelineItem(stopItem)
        this.callbacks?.onTimelineUpdate(stopItem)
        SessionRepository.saveSession(session)
        this.callbacks?.onSessionUpdate(session)
      }
    }
  }

  /**
   * Autonomous multi-turn loop inside the same web-chat session using sendToWebChat.
   */
  private static async runLoop(session: Session, prompt: string, signal: AbortSignal): Promise<void> {
    let currentPrompt: string | null = prompt
    let recoveryAttempts = 0
    const recentCalls: { name: string; argsHash: string; output: string; isError?: boolean }[] = []

    const cooldownTimerMs = session.delays?.cooldownTimerMs ?? session.delays?.sendPromptDelayMs ?? 3000
    const sendDelayMs = session.delays?.sendDelayMs ?? session.delays?.interactionDelayMs ?? 1000
    const toolExecutionDelayMs = session.delays?.toolExecutionDelayMs ?? 150

    let cooldownExpiresAt = 0

    while (currentPrompt && !signal.aborted) {
      // Pacing: Cooldown timer check. Agent cannot send prompt if timer is still running.
      const now = Date.now()
      if (now < cooldownExpiresAt) {
        const remaining = cooldownExpiresAt - now
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
      if (signal.aborted) break

      // 1. Deliver prompt to web chat (with mandatory tool JSON rule at the bottom) and wait for scraped response
      const promptToDeliver = appendToolJsonFormatRule(currentPrompt)
      const sendResult = await sendToWebChat(session.targetId, promptToDeliver, sendDelayMs)
      if (signal.aborted) break

      // Mark the cooldown timer start IMMEDIATELY upon receiving response from LLM chat
      cooldownExpiresAt = Date.now() + cooldownTimerMs

      if (!sendResult.ok || !sendResult.text) {
        throw new Error(sendResult.error || 'Received empty response from web chat platform.')
      }

      // 2. Parse response into clean text, thoughts, and tool calls
      const parsed = ToolCallParser.parse(sendResult.text)

      // Post assistant message to timeline
      const assistantItem: TimelineItem = {
        id: `msg_${Date.now()}_a`,
        sessionId: session.id,
        role: 'assistant',
        content: parsed.cleanContent || undefined,
        thinking: parsed.thinking,
        timestamp: Date.now(),
        isFinish: parsed.finished,
      }
      SessionRepository.saveTimelineItem(assistantItem)
      this.callbacks?.onTimelineUpdate(assistantItem)

      // Model declared completion via {"tool_call_name": "finish"}
      if (parsed.finished) {
        session.status = 'idle'
        session.updatedAt = Date.now()
        SessionRepository.saveSession(session)
        this.callbacks?.onSessionUpdate(session)
        break
      }

      // 3. Autonomous recovery checks (If no tool calls are parsed and model didn't finish)
      if (parsed.toolCalls.length === 0) {
        if (recoveryAttempts < 3) {
          recoveryAttempts++

          let issue = parsed.formatError || 'Your response did not include a JSON tool call object.'
          if (AgentDoubtDetector.hasDoubtOrHelplessness(sendResult.text)) {
            issue = 'Agent expressed doubt about tool availability. Notice: all workspace tools listed below are 100% active and autonomous in your session.'
          } else if (AgentIntentDetector.isVagueOrUnfulfilled(sendResult.text)) {
            issue = 'Your response was conversational or unfulfilled without invoking an active tool.'
          }

          const warnItem: TimelineItem = {
            id: `msg_${Date.now()}_format_warn`,
            sessionId: session.id,
            role: 'assistant',
            content: `⚠️ Web chat LLM did not reply in tools JSON format. Sending warning with complete available tools format (attempt ${recoveryAttempts}/3)...`,
            timestamp: Date.now(),
          }
          SessionRepository.saveTimelineItem(warnItem)
          this.callbacks?.onTimelineUpdate(warnItem)

          currentPrompt = buildToolFormatWarningPrompt(session.customTools, issue)
          continue
        }

        // If recovery attempts exceeded 3, pause and notify
        session.status = 'paused'
        session.updatedAt = Date.now()
        const stalledItem: TimelineItem = {
          id: `msg_${Date.now()}_stalled`,
          sessionId: session.id,
          role: 'assistant',
          content: `⚠️ Agent paused: Web chat LLM failed to reply in tools JSON format after 3 warning attempts.`,
          timestamp: Date.now(),
        }
        SessionRepository.saveTimelineItem(stalledItem)
        this.callbacks?.onTimelineUpdate(stalledItem)
        SessionRepository.saveSession(session)
        this.callbacks?.onSessionUpdate(session)
        break
      }

      // Reset recovery attempts on successful tool parse
      recoveryAttempts = 0

      // Execute each tool call sequentially with delay between calls
      const toolResults: ToolResult[] = []
      let fullFileReadCount = 0
      let wroteFile = false

      for (let i = 0; i < parsed.toolCalls.length; i++) {
        if (signal.aborted) break
        if (i > 0) {
          // Pacing: Wait between sequential tool executions (default 150ms for stability)
          await new Promise((resolve) => setTimeout(resolve, toolExecutionDelayMs))
          if (signal.aborted) break
        }
        const call = parsed.toolCalls[i]

        // Context protection: Do not allow read_file_full or copy_file_to_chat to be batched with other tools
        if (call.name === 'read_file_full' || call.name === 'copy_file_to_chat') {
          fullFileReadCount++
          if (parsed.toolCalls.length > 1 || fullFileReadCount > 1) {
            toolResults.push({
              toolCallId: call.id,
              name: call.name,
              output: `Error: '${call.name}' cannot be batched with other tool calls. Run ${call.name} individually in its own turn to protect the context window.`,
              isError: true,
            })
            continue
          }
        }

        // Tool gate: schema + path validation before anything touches the filesystem
        const invalid = validateCall(call, session.workspacePath)
        if (invalid) {
          toolResults.push({ toolCallId: call.id, name: call.name, output: invalid, isError: true })
          continue
        }
        const argsHash = JSON.stringify(call.arguments)

        // Repetition Guard: Detect identical calls that failed or yielded no matches in previous turns
        const previousDuplicate = recentCalls.find(
          (c) => c.name === call.name && c.argsHash === argsHash
        )

        if (
          previousDuplicate &&
          (previousDuplicate.isError ||
            previousDuplicate.output.includes('(No matches found)') ||
            previousDuplicate.output.includes('0 results') ||
            previousDuplicate.output.includes('not found') ||
            previousDuplicate.output.includes('does not exist'))
        ) {
          toolResults.push({
            toolCallId: call.id,
            name: call.name,
            output: `Error: Repetition detected! You executed this exact same tool call '${call.name}' with identical parameters in a previous turn, which returned: "${previousDuplicate.output.slice(0, 120)}...". Do NOT repeat identical commands or searches. Change your search query, check a different directory, or read the target file directly.`,
            isError: true,
          })
          continue
        }

        // Reread guard: first redundant full reread is allowed with a warning, further ones are blocked
        const target: string | undefined = call.arguments.AbsolutePath ?? call.arguments.TargetFile
        const isWrite = call.name === 'write_file' || call.name === 'replace_file_content'
        const isFullRead =
          call.name === 'read_file_full' ||
          call.name === 'copy_file_to_chat' ||
          (call.name === 'read_file' && !call.arguments.StartLine && !call.arguments.EndLine)
        let rereadWarn = ''
        if (isFullRead && target) {
          const verdict = checkReread(session.id, target)
          if (verdict === 'block') {
            toolResults.push({
              toolCallId: call.id,
              name: call.name,
              output: `Error: ${target} is unchanged since you last read it; its full content is already in your context. Use it, or edit the file directly.`,
              isError: true,
            })
            continue
          }
          if (verdict === 'warn') {
            rereadWarn = `\n[warning: this file was unchanged since you last read it. Do not reread files you already have; further rereads of unchanged files will be blocked.]`
          }
        }

        const result = await this.processToolCall(session, call, signal)
        // Failed search-block edit: the model legitimately needs to look at the file again
        if (call.name === 'replace_file_content' && result.isError && target) forget(session.id, target)
        if (!result.isError && target && (isFullRead || isWrite || call.name === 'read_file')) {
          if (isWrite) {
            forget(session.id, target)
            wroteFile = true
          }
          const info = fileInfo(target)
          if (info) result.output += `\n[sha256=${info.sha} bytes=${info.bytes}]`
        }
        result.output += rereadWarn
        toolResults.push(result)
        recentCalls.push({
          name: call.name,
          argsHash,
          output: result.output,
          isError: result.isError,
        })
        if (recentCalls.length > 20) recentCalls.shift()

        // Pacing: Brief stability pause after tool execution
        await new Promise((resolve) => setTimeout(resolve, toolExecutionDelayMs))
        if (signal.aborted) break
      }

      if (signal.aborted) break

      // Opt-in post-write validation: append typecheck result to the last tool result
      if (wroteFile && session.customTools?.enablePostWriteCheck && toolResults.length) {
        const report = await typecheck(session.workspacePath, getExtendedEnv())
        if (report) toolResults[toolResults.length - 1].output += `\n${report}`
      }

      if (signal.aborted) break

      // 5. Format tool results into Markdown for subsequent turn
      const nextTurnMarkdown = toolResults.map((r) => ToolCallParser.formatToolResult(r)).join('\n\n')
      currentPrompt = nextTurnMarkdown
    }
  }

  /**
   * Process a single tool call: permission evaluation, approval wait, execution, diff calculation.
   */
  private static async processToolCall(session: Session, call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    const perm = PermissionGateway.evaluate(call, session.autoApprove, session.customTools)

    if (perm.isDisabled) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Error: ${perm.reason || `Tool '${call.name}' is disabled in Custom Tools settings.`}`,
        isError: true,
      }
    }

    // Compute diff preview if file tool
    let diffPreview: any = undefined
    if (call.name === 'write_file') {
      const targetFile = path.isAbsolute(call.arguments.TargetFile)
        ? call.arguments.TargetFile
        : path.join(session.workspacePath, call.arguments.TargetFile)
      diffPreview = FilesystemTools.previewWriteFile(targetFile, call.arguments.CodeContent || '')
    } else if (call.name === 'replace_file_content') {
      const targetFile = path.isAbsolute(call.arguments.TargetFile)
        ? call.arguments.TargetFile
        : path.join(session.workspacePath, call.arguments.TargetFile)
      const preview = FilesystemTools.previewReplaceFileContent(
        targetFile,
        call.arguments.TargetContent || '',
        call.arguments.ReplacementContent || '',
      )
      diffPreview = preview.diff
    }

    const toolItem: TimelineItem = {
      id: `msg_${Date.now()}_tool_${call.name}`,
      sessionId: session.id,
      role: 'tool',
      toolCall: {
        id: call.id,
        name: call.name,
        args: call.arguments,
        status: perm.requiresApproval ? 'pending' : 'auto_approved',
        diff: diffPreview,
      },
      timestamp: Date.now(),
    }
    SessionRepository.saveTimelineItem(toolItem)
    this.callbacks?.onTimelineUpdate(toolItem)

    // Wait for user approval if needed
    if (perm.requiresApproval) {
      session.status = 'paused'
      SessionRepository.saveSession(session)
      this.callbacks?.onSessionUpdate(session)

      const approved = await new Promise<boolean>((resolve) => {
        this.pendingApprovals.set(call.id, { sessionId: session.id, resolve })
      })

      this.pendingApprovals.delete(call.id)

      if (!approved) {
        if (toolItem.toolCall) toolItem.toolCall.status = 'rejected'
        SessionRepository.saveTimelineItem(toolItem)
        this.callbacks?.onTimelineUpdate(toolItem)

        session.status = 'running'
        SessionRepository.saveSession(session)
        this.callbacks?.onSessionUpdate(session)

        return {
          toolCallId: call.id,
          name: call.name,
          output: 'User rejected this tool execution request.',
          isError: true,
        }
      }

      if (toolItem.toolCall) toolItem.toolCall.status = 'approved'
      SessionRepository.saveTimelineItem(toolItem)
      this.callbacks?.onTimelineUpdate(toolItem)

      session.status = 'running'
      SessionRepository.saveSession(session)
      this.callbacks?.onSessionUpdate(session)
    }

    // Execute tool
    let result: ToolResult

    if (call.name === 'run_command') {
      const cmd = call.arguments.CommandLine
      const cwd = call.arguments.Cwd
        ? path.isAbsolute(call.arguments.Cwd)
          ? call.arguments.Cwd
          : path.join(session.workspacePath, call.arguments.Cwd)
        : session.workspacePath

      let streamAcc = ''
      result = await this.runner.run(call.id, cmd, {
        cwd,
        onChunk: (chunk) => {
          streamAcc += chunk
          this.callbacks?.onTerminalChunk({ toolCallId: call.id, chunk })
        },
      })
      if (toolItem.toolCall) toolItem.toolCall.terminalStream = streamAcc
    } else if (call.name === 'read_file') {
      const targetFile = path.isAbsolute(call.arguments.AbsolutePath)
        ? call.arguments.AbsolutePath
        : path.join(session.workspacePath, call.arguments.AbsolutePath)
      result = FilesystemTools.readFile(call.id, targetFile, call.arguments.StartLine, call.arguments.EndLine)
    } else if (call.name === 'write_file') {
      const targetFile = path.isAbsolute(call.arguments.TargetFile)
        ? call.arguments.TargetFile
        : path.join(session.workspacePath, call.arguments.TargetFile)
      result = FilesystemTools.writeFile(call.id, targetFile, call.arguments.CodeContent || '', call.arguments.Overwrite ?? true)
      if (!result.isError && diffPreview) {
        SessionRepository.recordModifiedFile(session.id, {
          path: targetFile,
          status: diffPreview.oldContent ? 'modified' : 'added',
          additions: diffPreview.additions,
          deletions: diffPreview.deletions,
          oldContent: diffPreview.oldContent,
          newContent: diffPreview.newContent,
        })
      }
    } else if (call.name === 'replace_file_content') {
      const targetFile = path.isAbsolute(call.arguments.TargetFile)
        ? call.arguments.TargetFile
        : path.join(session.workspacePath, call.arguments.TargetFile)
      result = FilesystemTools.replaceFileContent(
        call.id,
        targetFile,
        call.arguments.TargetContent || '',
        call.arguments.ReplacementContent || '',
      )
      if (!result.isError && diffPreview) {
        SessionRepository.recordModifiedFile(session.id, {
          path: targetFile,
          status: 'modified',
          additions: diffPreview.additions,
          deletions: diffPreview.deletions,
          oldContent: diffPreview.oldContent,
          newContent: diffPreview.newContent,
        })
      }
    } else if (call.name === 'list_directory') {
      const targetDir = call.arguments.DirectoryPath
        ? path.isAbsolute(call.arguments.DirectoryPath)
          ? call.arguments.DirectoryPath
          : path.join(session.workspacePath, call.arguments.DirectoryPath)
        : session.workspacePath
      result = DirectoryExplorer.listDirectory(call.id, targetDir, call.arguments.Recursive, call.arguments.Depth)
    } else if (call.name === 'read_file_full') {
      const targetFile = path.isAbsolute(call.arguments.AbsolutePath)
        ? call.arguments.AbsolutePath
        : path.join(session.workspacePath, call.arguments.AbsolutePath)
      result = CustomToolsService.readFileFull(call.id, targetFile)
    } else if (call.name === 'copy_file_to_chat') {
      const targetFile = path.isAbsolute(call.arguments.AbsolutePath)
        ? call.arguments.AbsolutePath
        : path.join(session.workspacePath, call.arguments.AbsolutePath)
      result = CustomToolsService.copyFileToChat(call.id, targetFile)
    } else if (call.name === 'gitnexus_query') {
      result = await CustomToolsService.gitnexusQuery(call.id, session.workspacePath, call.arguments.Query || '')
    } else if (call.name === 'gitnexus_context') {
      result = await CustomToolsService.gitnexusContext(call.id, session.workspacePath, call.arguments.Target || '')
    } else if (call.name === 'grep_search') {
      result = await CustomToolsService.grepSearch(call.id, session.workspacePath, call.arguments.Query || '', call.arguments.Path)
    } else if (call.name === 'ask_user') {
      const answer = await new Promise<string>((resolve) => {
        this.pendingUserInputs.set(call.id, { sessionId: session.id, resolve })
      })
      this.pendingUserInputs.delete(call.id)
      result = {
        toolCallId: call.id,
        name: 'ask_user',
        output: answer,
        isError: false,
      }
    } else {
      result = {
        toolCallId: call.id,
        name: call.name,
        output: `Error: Unknown tool '${call.name}'`,
        isError: true,
      }
    }

    if (toolItem.toolCall) {
      toolItem.toolCall.result = result
    }
    SessionRepository.saveTimelineItem(toolItem)
    this.callbacks?.onTimelineUpdate(toolItem)

    return result
  }

  static approveToolCall(toolCallId: string): void {
    const pending = this.pendingApprovals.get(toolCallId)
    if (pending) pending.resolve(true)
  }

  static rejectToolCall(toolCallId: string): void {
    const pending = this.pendingApprovals.get(toolCallId)
    if (pending) pending.resolve(false)
  }

  static respondToUserInput(toolCallId: string, answer: string): void {
    const pending = this.pendingUserInputs.get(toolCallId)
    if (pending) pending.resolve(answer)
  }

  static abortAgent(sessionId: string): void {
    cancelWebChat()
    const session = this.activeSessions.get(sessionId)
    if (session) {
      session.abortController.abort()
      this.activeSessions.delete(sessionId)
    }
    // Unblock a loop waiting on approval / ask_user so it can observe the abort
    for (const [id, p] of this.pendingApprovals) if (p.sessionId === sessionId) p.resolve(false)
    for (const [id, p] of this.pendingUserInputs) if (p.sessionId === sessionId) p.resolve('')
  }
}
