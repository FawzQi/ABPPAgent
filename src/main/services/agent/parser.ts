import type { ThinkingBlock, ToolCall, ToolResult } from '@shared/types'

export interface ParsedAssistantResponse {
  cleanContent: string
  thinking?: ThinkingBlock
  toolCalls: ToolCall[]
}

/**
 * Robust XML parser for extracting <thought> and <tool_call> tags from assistant responses.
 */
export class ToolCallParser {
  /**
   * Parse full assistant response text into message body, thinking trace, and tool calls.
   */
  static parse(rawText: string): ParsedAssistantResponse {
    let cleanText = rawText
    let thinking: ThinkingBlock | undefined
    const toolCalls: ToolCall[] = []

    // 1. Extract thinking block: <thought>...</thought> or <thinking>...</thinking>
    const thoughtRegex = /<(?:thought|thinking)>([\s\S]*?)<\/(?:thought|thinking)>/i
    const thoughtMatch = thoughtRegex.exec(cleanText)
    if (thoughtMatch) {
      thinking = {
        content: thoughtMatch[1].trim(),
      }
      cleanText = cleanText.replace(thoughtRegex, '').trim()
    }

    // 2. Extract tool calls: <tool_call name="...">...</tool_call>
    const toolCallRegex = /<tool_call\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool_call>/gi
    let match: RegExpExecArray | null

    while ((match = toolCallRegex.exec(cleanText)) !== null) {
      const rawXml = match[0]
      const name = match[1].trim()
      const rawArgs = match[2].trim()

      let parsedArgs: Record<string, any> = {}
      if (rawArgs) {
        try {
          parsedArgs = JSON.parse(rawArgs)
        } catch {
          // If JSON parse fails, attempt basic cleanup (e.g. trailing commas or markdown code fences)
          const sanitized = rawArgs
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .replace(/,\s*([}\]])/g, '$1')
            .trim()
          try {
            parsedArgs = JSON.parse(sanitized)
          } catch {
            parsedArgs = { raw: rawArgs }
          }
        }
      }

      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        arguments: parsedArgs,
        rawXml,
      })
    }

    // Remove tool call XML blocks from the user-facing text
    cleanText = cleanText.replace(/<tool_call\s+name=["'][^"']+["']>[\s\S]*?<\/tool_call>/gi, '').trim()

    return {
      cleanContent: cleanText,
      thinking,
      toolCalls,
    }
  }

  /**
   * Format tool result into the standardized XML prompt for the next turn.
   */
  static formatToolResult(result: ToolResult): string {
    const payload = {
      Status: result.isError ? 'Error' : 'Success',
      ExitCode: result.exitCode ?? (result.isError ? 1 : 0),
      Output: result.output,
    }
    return `<tool_result name="${result.name}">\n${JSON.stringify(payload, null, 2)}\n</tool_result>`
  }
}
