import { describe, it, expect } from 'vitest'
import { ToolCallParser } from '../../src/main/services/agent/parser'
import { buildSystemPrompt } from '../../src/main/services/agent/prompt'

describe('Agent Orchestration Flow', () => {
  it('builds system prompt with workspace path', () => {
    const prompt = buildSystemPrompt('/test/workspace')
    expect(prompt).toContain('/test/workspace')
    expect(prompt).toContain('run_command')
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('write_file')
    expect(prompt).toContain('<tool_call name=')
  })

  it('correctly simulates multi-turn tool cycle', () => {
    // Turn 1 Assistant Response
    const turn1AssistantRaw = `<thought>
I need to check the configuration file to see what is missing.
</thought>
I will read the config.json file.
<tool_call name="read_file">
{
  "AbsolutePath": "config.json"
}
</tool_call>`

    const parsed1 = ToolCallParser.parse(turn1AssistantRaw)
    expect(parsed1.thinking?.content).toContain('check the configuration file')
    expect(parsed1.cleanContent).toBe('I will read the config.json file.')
    expect(parsed1.toolCalls.length).toBe(1)
    expect(parsed1.toolCalls[0].name).toBe('read_file')

    // Tool execution simulation
    const toolResult1 = {
      toolCallId: parsed1.toolCalls[0].id,
      name: parsed1.toolCalls[0].name,
      output: '1: { "port": 3000 }',
      exitCode: 0,
      isError: false,
    }

    const nextPromptXml = ToolCallParser.formatToolResult(toolResult1)
    expect(nextPromptXml).toContain('<tool_result name="read_file">')
    expect(nextPromptXml).toContain('port')

    // Turn 2 Assistant Response (final answer, no tools)
    const turn2AssistantRaw = `<thought>
The config specifies port 3000. Everything is properly set up.
</thought>
The configuration uses port 3000 and is complete.`

    const parsed2 = ToolCallParser.parse(turn2AssistantRaw)
    expect(parsed2.toolCalls.length).toBe(0)
    expect(parsed2.cleanContent).toContain('The configuration uses port 3000')
  })
})
