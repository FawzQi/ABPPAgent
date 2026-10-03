import type { ThinkingBlock, ToolCall, ToolResult } from '@shared/types'

export interface ParsedAssistantResponse {
  cleanContent: string
  thinking?: ThinkingBlock
  toolCalls: ToolCall[]
}

/**
 * Robust XML and DSML parser for extracting <thought>, <tool_call>, and DeepSeek DSML tool calls.
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

    // 2. Extract standard XML tool calls: <tool_call name="...">...</tool_call>
    const standardToolRegex = /<tool_call\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool_call>/gi
    let match: RegExpExecArray | null

    while ((match = standardToolRegex.exec(cleanText)) !== null) {
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

    // 3. Extract DeepSeek native DSML tool calls:
    // <｜｜DSML｜｜ invoke name="...">...<｜｜DSML｜｜ parameter name="...">value</｜｜DSML｜｜ parameter>...</｜｜DSML｜｜ invoke>
    // Handles both standard ASCII pipe '|' and Unicode fullwidth vertical bar '｜' (U+FF5C)
    const dsmlInvokeRegex = /<[|｜]{2}DSML[|｜]{2}\s+invoke\s+name=["']([^"']+)["']>([\s\S]*?)<\/[|｜]{2}DSML[|｜]{2}\s+invoke>/gi
    let dsmlMatch: RegExpExecArray | null

    while ((dsmlMatch = dsmlInvokeRegex.exec(cleanText)) !== null) {
      const rawXml = dsmlMatch[0]
      const name = dsmlMatch[1].trim()
      const body = dsmlMatch[2]

      const parsedArgs: Record<string, any> = {}
      const paramRegex = /<[|｜]{2}DSML[|｜]{2}\s+parameter\s+name=["']([^"']+)["'](?:\s+[^>]*)?>([\s\S]*?)<\/[|｜]{2}DSML[|｜]{2}\s+parameter>/gi
      let paramMatch: RegExpExecArray | null

      while ((paramMatch = paramRegex.exec(body)) !== null) {
        const paramName = paramMatch[1].trim()
        const rawVal = paramMatch[2].trim()

        if (rawVal === 'true') {
          parsedArgs[paramName] = true
        } else if (rawVal === 'false') {
          parsedArgs[paramName] = false
        } else if (/^-?\d+$/.test(rawVal)) {
          parsedArgs[paramName] = parseInt(rawVal, 10)
        } else if (/^-?\d+\.\d+$/.test(rawVal)) {
          parsedArgs[paramName] = parseFloat(rawVal)
        } else {
          try {
            parsedArgs[paramName] = JSON.parse(rawVal)
          } catch {
            parsedArgs[paramName] = rawVal
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

    // 4. Clean user-facing text: strip XML tool calls and DSML tokens
    cleanText = cleanText
      .replace(/<tool_call\s+name=["'][^"']+["']>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<[|｜]{2}DSML[|｜]{2}\s+invoke[\s\S]*?<\/[|｜]{2}DSML[|｜]{2}\s+invoke>/gi, '')
      .replace(/<[|｜]{2}DSML[|｜]{2}[^>]*>/gi, '')
      .replace(/<\/[|｜]{2}DSML[|｜]{2}[^>]*>/gi, '')
      .trim()

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
