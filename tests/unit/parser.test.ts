import { describe, it, expect } from 'vitest'
import { ToolCallParser } from '../../src/main/services/agent/parser'

describe('ToolCallParser', () => {
  it('extracts thinking blocks and clean text', () => {
    const raw = `<thought>
I need to check the package.json file.
</thought>
I will now read the file to check dependencies.`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.thinking?.content).toBe('I need to check the package.json file.')
    expect(parsed.cleanContent).toBe('I will now read the file to check dependencies.')
    expect(parsed.toolCalls.length).toBe(0)
  })

  it('extracts tool calls with JSON arguments', () => {
    const raw = `Let me run the test suite.

<tool_call name="run_command">
{
  "CommandLine": "npm test",
  "Cwd": "./"
}
</tool_call>`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.cleanContent).toBe('Let me run the test suite.')
    expect(parsed.toolCalls.length).toBe(1)
    expect(parsed.toolCalls[0].name).toBe('run_command')
    expect(parsed.toolCalls[0].arguments).toEqual({
      CommandLine: 'npm test',
      Cwd: './',
    })
  })

  it('formats tool results into XML tags for next turn', () => {
    const result = {
      toolCallId: 'call_123',
      name: 'run_command',
      output: 'All 5 tests passed',
      exitCode: 0,
      isError: false,
    }

    const xml = ToolCallParser.formatToolResult(result)
    expect(xml).toContain('<tool_result name="run_command">')
    expect(xml).toContain('"Status": "Success"')
    expect(xml).toContain('"ExitCode": 0')
    expect(xml).toContain('"Output": "All 5 tests passed"')
    expect(xml).toContain('</tool_result>')
  })
})
