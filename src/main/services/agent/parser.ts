import type { ThinkingBlock, ToolCall, ToolResult } from '@shared/types'

export interface ParsedAssistantResponse {
  cleanContent: string
  thinking?: ThinkingBlock
  toolCalls: ToolCall[]
}

function extractArgsFromBody(body: string): Record<string, any> {
  const args: Record<string, any> = {}

  // 1. Try DSML parameter extraction: <||DSML|| parameter name="...">value</||DSML|| parameter>
  const paramRegex = /<[|｜]{2}DSML[|｜]{2}\s*parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/[|｜]{2}DSML[|｜]{2}\s*parameter>/gi
  let paramMatch: RegExpExecArray | null
  let foundParam = false

  while ((paramMatch = paramRegex.exec(body)) !== null) {
    foundParam = true
    const paramName = paramMatch[1].trim()
    const rawVal = paramMatch[2].trim()

    if (rawVal === 'true') {
      args[paramName] = true
    } else if (rawVal === 'false') {
      args[paramName] = false
    } else if (/^-?\d+$/.test(rawVal)) {
      args[paramName] = parseInt(rawVal, 10)
    } else if (/^-?\d+\.\d+$/.test(rawVal)) {
      args[paramName] = parseFloat(rawVal)
    } else {
      try {
        args[paramName] = JSON.parse(rawVal)
      } catch {
        args[paramName] = rawVal
      }
    }
  }

  if (foundParam && Object.keys(args).length > 0) {
    return args
  }

  // 2. Try JSON object extraction: substring between first { and last }
  const firstBrace = body.indexOf('{')
  const lastBrace = body.lastIndexOf('}')

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = body.slice(firstBrace, lastBrace + 1).trim()
    try {
      return JSON.parse(jsonStr)
    } catch {
      const sanitized = jsonStr
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .replace(/,\s*([}\]])/g, '$1')
        .trim()
      try {
        return JSON.parse(sanitized)
      } catch {
        const kvRegex = /"([^"]+)"\s*:\s*("(?:\\.|[^"\\])*"|\d+|true|false)/g
        let kvMatch: RegExpExecArray | null
        while ((kvMatch = kvRegex.exec(jsonStr)) !== null) {
          try {
            args[kvMatch[1]] = JSON.parse(kvMatch[2])
          } catch {
            args[kvMatch[1]] = kvMatch[2]
          }
        }
        if (Object.keys(args).length > 0) return args
      }
    }
  }

  return args
}

/**
 * Universal XML & DSML fuzzy parser for extracting <thought> and <tool_call> tags.
 */
export class ToolCallParser {
  /**
   * Check if a raw response contains any attempt to invoke a tool,
   * even if formatted incorrectly or unclosed.
   */
  static hasToolCallAttempt(rawText: string): boolean {
    return /<(?:tool_call|[|｜]{2}DSML[|｜]{2}\s*(?:invoke|calls))|name=["'](?:run_command|read_file|write_file|replace_file_content|list_directory|ask_user)["']/i.test(
      rawText,
    )
  }

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

    // 2. Scan all tool block openings: <tool_call name="..."> or <||DSML|| invoke name="...">
    const toolStartRegex = /<(?:tool_call|[|｜]{2}DSML[|｜]{2}\s*invoke)\s+name=["']([^"']+)["'][^>]*>/gi
    const starts: { index: number; length: number; name: string; fullMatch: string }[] = []
    let m: RegExpExecArray | null

    while ((m = toolStartRegex.exec(cleanText)) !== null) {
      starts.push({
        index: m.index,
        length: m[0].length,
        name: m[1].trim(),
        fullMatch: m[0],
      })
    }

    // 3. For each opening tag, determine boundary and extract arguments
    for (let i = 0; i < starts.length; i++) {
      const cur = starts[i]
      const bodyStartIndex = cur.index + cur.length
      const nextStart = i + 1 < starts.length ? starts[i + 1].index : cleanText.length

      const chunk = cleanText.slice(bodyStartIndex, nextStart)

      // Look for closing tag in this chunk: </tool_call> or </||DSML|| invoke> or </||DSML|| calls>
      const closeRegex = /<\/(?:tool_call|[|｜]{2}DSML[|｜]{2}\s*(?:invoke|calls))>/i
      const closeMatch = closeRegex.exec(chunk)

      const body = closeMatch ? chunk.slice(0, closeMatch.index) : chunk
      const parsedArgs = extractArgsFromBody(body)

      // Accept if arguments were extracted or if body is explicitly empty object
      if (Object.keys(parsedArgs).length > 0 || body.trim() === '{}') {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}`,
          name: cur.name,
          arguments: parsedArgs,
          rawXml: cleanText.slice(
            cur.index,
            closeMatch ? bodyStartIndex + closeMatch.index + closeMatch[0].length : nextStart,
          ),
        })
      }
    }

    // 4. Clean user-facing text: strip all tool blocks and formatting artifacts
    cleanText = cleanText
      .replace(
        /<(?:tool_call|[|｜]{2}DSML[|｜]{2}\s*invoke)\s+name=["'][^"']+["'][\s\S]*?<\/(?:tool_call|[|｜]{2}DSML[|｜]{2}\s*(?:invoke|calls))>/gi,
        '',
      )
      .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<[|｜]{2}DSML[|｜]{2}[\s\S]*?<\/[|｜]{2}DSML[|｜]{2}[^>]*>/gi, '')
      .replace(/<[|｜]{2}DSML[|｜]{2}[^>]*>/gi, '')
      .replace(/<\/[|｜]{2}DSML[|｜]{2}[^>]*>/gi, '')
      .replace(/<tool_call\s+name=["'][^"']+["'][^>]*>/gi, '')
      .replace(/<\/tool_call>/gi, '')
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
