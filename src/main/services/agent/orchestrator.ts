import path from 'node:path'
import type { Session, TimelineItem, ToolCall, ToolResult } from '@shared/types'
import { SessionRepository } from '../db/repository'
import { sendToWebChat, cancelWebChat } from '../web-chat/web-chat-service'
import { ToolCallParser } from './parser'
import { PermissionGateway } from './permissions'
import { buildSystemPrompt } from './prompt'
import { ProcessRunner } from '../tools/runner'
import { FilesystemTools } from '../tools/filesystem'
import { DirectoryExplorer } from '../tools/explorer'

export interface OrchestratorCallbacks {
  onTimelineUpdate: (item: TimelineItem) => void
  onSessionUpdate: (session: Session) => void
  onTerminalChunk: (data: { toolCallId: string; chunk: string }) => void
}

export class AgentOrchestrator {
  private static runner = new ProcessRunner()
  private static activeSessions = new Map<string, { abortController: AbortController }>()
  private static pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>()
  private static pendingUserInputs = new Map<string, { resolve: (answer: string) => void }>()
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
    if (isFirstTurn) {
      const sysPrompt = buildSystemPrompt(session.workspacePath)
      promptToSend = `${sysPrompt}\n\nUSER GOAL:\n${userText}`
    }

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
    }
  }

  /**
   * Autonomous multi-turn loop inside the same web-chat session using sendToWebChat.
   */
  private static async runLoop(session: Session, prompt: string, signal: AbortSignal): Promise<void> {
    let currentPrompt: string | null = prompt
    let recoveryAttempts = 0

    while (currentPrompt && !signal.aborted) {
      // Pacing: 1 second delay for each interaction to let event loops settle
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (signal.aborted) break

      // 1. Deliver prompt to web chat and wait for scraped response
      const sendResult = await sendToWebChat(session.targetId, currentPrompt)
      if (signal.aborted) break

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
      }
      SessionRepository.saveTimelineItem(assistantItem)
      this.callbacks?.onTimelineUpdate(assistantItem)

      // 3. Format error recovery check
      if (parsed.toolCalls.length === 0) {
        if (ToolCallParser.hasToolCallAttempt(sendResult.text) && recoveryAttempts < 3) {
          recoveryAttempts++
          const nudgeItem: TimelineItem = {
            id: `msg_${Date.now()}_nudge`,
            sessionId: session.id,
            role: 'assistant',
            content: `⚠️ Tool call formatting error detected in response. Automatically requesting re-formatting (attempt ${recoveryAttempts}/3)...`,
            timestamp: Date.now(),
          }
          SessionRepository.saveTimelineItem(nudgeItem)
          this.callbacks?.onTimelineUpdate(nudgeItem)

          currentPrompt = `<format_error>\nYour previous message attempted to invoke a tool but the tool format was invalid, unclosed, or had malformed arguments.\nPlease re-issue your tool call strictly using the valid format with JSON arguments:\n<tool_call name="tool_name">\n{\n  "parameter_name": "parameter_value"\n}\n</tool_call>\n</format_error>`
          continue
        }

        // If no tool calls and no attempt, task is complete
        session.status = 'idle'
        session.updatedAt = Date.now()
        SessionRepository.saveSession(session)
        this.callbacks?.onSessionUpdate(session)
        break
      }

      // Reset recovery attempts on successful tool parse
      recoveryAttempts = 0

      // 4. Execute each tool call sequentially
      const toolResults: ToolResult[] = []

      for (const call of parsed.toolCalls) {
        if (signal.aborted) break
        const result = await this.processToolCall(session, call, signal)
        toolResults.push(result)
      }

      if (signal.aborted) break

      // 5. Format tool results into XML for subsequent turn
      const nextTurnXml = toolResults.map((r) => ToolCallParser.formatToolResult(r)).join('\n\n')
      currentPrompt = nextTurnXml
    }
  }

  /**
   * Process a single tool call: permission evaluation, approval wait, execution, diff calculation.
   */
  private static async processToolCall(session: Session, call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    const perm = PermissionGateway.evaluate(call, session.autoApprove)

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
        this.pendingApprovals.set(call.id, { resolve })
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
    } else if (call.name === 'ask_user') {
      const answer = await new Promise<string>((resolve) => {
        this.pendingUserInputs.set(call.id, { resolve })
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
  }
}
