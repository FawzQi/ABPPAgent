import type { ThinkingBlock, ToolCall, ToolResult } from '@shared/types'

export interface ParsedAssistantResponse {
  cleanContent: string
  thinking?: ThinkingBlock
  toolCalls: ToolCall[]
}

function robustParseJsonArgs(jsonStr: string): Record<string, any> {
  // 1. Direct standard parse
  try {
    return JSON.parse(jsonStr)
  } catch {}

  // 2. Strip code block formatting & trailing commas
  const sanitized = jsonStr
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
  try {
    return JSON.parse(sanitized)
  } catch {}

  // 3. Intelligent boundary-aware property extraction
  // Avoids truncating multiline strings (like CodeContent) at the first unescaped quote!
  const args: Record<string, any> = {}
  const propertyKeyRegex = /"([a-zA-Z0-9_]+)"\s*:\s*/g
  const keys: { name: string; valueStartIndex: number }[] = []
  let keyMatch: RegExpExecArray | null

  while ((keyMatch = propertyKeyRegex.exec(jsonStr)) !== null) {
    keys.push({
      name: keyMatch[1],
      valueStartIndex: keyMatch.index + keyMatch[0].length,
    })
  }

  if (keys.length === 0) return args

  const lastBrace = jsonStr.lastIndexOf('}')
  const endLimit = lastBrace !== -1 ? lastBrace : jsonStr.length

  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i]
    const nextKey = keys[i + 1]

    let sliceEnd: number
    if (nextKey) {
      const precedingText = jsonStr.slice(currentKey.valueStartIndex, nextKey.valueStartIndex)
      const commaIndex = precedingText.lastIndexOf(',')
      sliceEnd =
        commaIndex !== -1
          ? currentKey.valueStartIndex + commaIndex
          : nextKey.valueStartIndex - nextKey.name.length - 3
    } else {
      sliceEnd = endLimit
    }

    let rawVal = jsonStr.slice(currentKey.valueStartIndex, sliceEnd).trim()
    if (rawVal.endsWith(',')) {
      rawVal = rawVal.slice(0, -1).trim()
    }

    if (rawVal === 'true') {
      args[currentKey.name] = true
    } else if (rawVal === 'false') {
      args[currentKey.name] = false
    } else if (/^-?\d+$/.test(rawVal)) {
      args[currentKey.name] = parseInt(rawVal, 10)
    } else if (/^-?\d+\.\d+$/.test(rawVal)) {
      args[currentKey.name] = parseFloat(rawVal)
    } else if (rawVal.startsWith('"')) {
      let innerStr = rawVal.slice(1)
      if (innerStr.endsWith('"')) {
        innerStr = innerStr.slice(0, -1)
      }
      try {
        args[currentKey.name] = JSON.parse(`"${innerStr}"`)
      } catch {
        // If unescaped quotes inside code broke standard JSON, preserve full content!
        args[currentKey.name] = innerStr
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
      }
    } else {
      try {
        args[currentKey.name] = JSON.parse(rawVal)
      } catch {
        args[currentKey.name] = rawVal
      }
    }
  }

  return args
}

function extractArgsFromBody(body: string): Record<string, any> {
  const firstBrace = body.indexOf('{')
  const lastBrace = body.lastIndexOf('}')

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = body.slice(firstBrace, lastBrace + 1).trim()
    return robustParseJsonArgs(jsonStr)
  }

  return {}
}

function extractDsmlToolCalls(text: string): ToolCall[] {
  const dsmlCalls: ToolCall[] = []
  const invokeRegex = /<[|｜]{2}DSML[|｜]{2}\s*invoke\s+name=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)(?:<\/[|｜]{2}DSML[|｜]{2}\s*invoke>|(?=<[|｜]{2}DSML[|｜]{2}\s*invoke)|$)/gi
  let match: RegExpExecArray | null

  let idx = 0
  while ((match = invokeRegex.exec(text)) !== null) {
    const toolName = match[1].trim()
    const invokeBody = match[2].trim()
    let args: Record<string, any> = {}

    // 1. Try parsing DSML parameter tags: <｜｜DSML｜｜ parameter name="...">value</｜｜DSML｜｜ parameter>
    const paramRegex = /<[|｜]{2}DSML[|｜]{2}\s*parameter\s+name=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/[|｜]{2}DSML[|｜]{2}\s*parameter>/gi
    let pMatch: RegExpExecArray | null
    while ((pMatch = paramRegex.exec(invokeBody)) !== null) {
      const pName = pMatch[1].trim()
      const rawVal = pMatch[2].trim()
      if (rawVal === 'true') args[pName] = true
      else if (rawVal === 'false') args[pName] = false
      else if (/^-?\d+$/.test(rawVal)) args[pName] = parseInt(rawVal, 10)
      else if (/^-?\d+\.\d+$/.test(rawVal)) args[pName] = parseFloat(rawVal)
      else {
        try {
          args[pName] = JSON.parse(rawVal)
        } catch {
          args[pName] = rawVal
        }
      }
    }

    // 2. If no parameter tags found, check if invokeBody has JSON arguments { ... }
    if (Object.keys(args).length === 0) {
      args = extractArgsFromBody(invokeBody)
    }

    if (Object.keys(args).length > 0 || invokeBody.includes('{}')) {
      dsmlCalls.push({
        id: `call_${Date.now()}_dsml_${Math.random().toString(36).slice(2, 7)}_${idx++}`,
        name: toolName,
        arguments: args,
        rawXml: match[0],
      })
    }
  }

  return dsmlCalls
}


/**
 * Universal XML parser for extracting <thought> and <tool_call> tags.
 */
export class ToolCallParser {
  /**
   * Check if a raw response contains any attempt to invoke a tool,
   * even if formatted incorrectly, unclosed, or in legacy DSML.
   */
  static hasToolCallAttempt(rawText: string): boolean {
    return /<tool_call\b|<[|｜]{2}DSML|name=["'](?:run_command|read_file|write_file|replace_file_content|list_directory|ask_user|grep_search|gitnexus_)/i.test(
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

    // 2. Scan all tool block openings: <tool_call name="...">
    const toolStartRegex = /<tool_call\s+name=["']([^"']+)["'][^>]*>/gi
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

      // Look for closing tag in this chunk: </tool_call>
      const closeRegex = /<\/tool_call>/i
      const closeMatch = closeRegex.exec(chunk)

      const body = closeMatch ? chunk.slice(0, closeMatch.index) : chunk
      const parsedArgs = extractArgsFromBody(body)

      // Accept if arguments were extracted or if body is explicitly empty object
      if (Object.keys(parsedArgs).length > 0 || body.trim() === '{}') {
        // Sanity check: do not accept obviously truncated code fragments in write_file
        if (cur.name === 'write_file' && typeof parsedArgs.CodeContent === 'string') {
          const trimmed = parsedArgs.CodeContent.trim()
          if (trimmed.length < 50 && /^(?:import|export)\s+.*?\s+from\s*["']?$/m.test(trimmed)) {
            // Skips truncated tool call; causes hasToolCallAttempt to nudge LLM to re-emit full code
            continue
          }
        }

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

    // 3b. Fallback: Parse DSML tool calls if model used DSML invoke format
    if (toolCalls.length === 0) {
      const dsmlCalls = extractDsmlToolCalls(cleanText)
      toolCalls.push(...dsmlCalls)
    }

    // 4. Clean user-facing text: strip tool blocks and formatting artifacts
    cleanText = cleanText
      .replace(/<tool_call\s+name=["'][^"']+["'][\s\S]*?<\/tool_call>/gi, '')
      .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<tool_call\s+name=["'][^"']+["'][^>]*>/gi, '')
      .replace(/<\/tool_call>/gi, '')
      // Strip rogue DSML tokens if emitted so they don't leak into user UI
      .replace(/<[|｜]{2}DSML[|｜]{2}[\s\S]*?<\/[|｜]{2}DSML[|｜]{2}[^>]*>/gi, '')
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
