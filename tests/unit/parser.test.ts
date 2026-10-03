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

  it('extracts DeepSeek native DSML tool calls correctly', () => {
    const raw = `<thought>
Examining the main game file.
</thought>
Let me examine mainGame.cpp structure.

<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="run_command">
<｜｜DSML｜｜ parameter name="CommandLine" string="true">grep -n 'InitWindow|BeginDrawing' mainGame.cpp</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
<｜｜DSML｜｜ invoke name="list_directory">
<｜｜DSML｜｜ parameter name="DirectoryPath" string="true">/home/faiq/data/arts/gaming2</｜｜DSML｜｜ parameter>
<｜｜DSML｜｜ parameter name="Recursive" boolean="true">true</｜｜DSML｜｜ parameter>
<｜｜DSML｜｜ parameter name="Depth" number="true">2</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.thinking?.content).toBe('Examining the main game file.')
    expect(parsed.cleanContent).toBe('Let me examine mainGame.cpp structure.')
    expect(parsed.toolCalls.length).toBe(2)

    expect(parsed.toolCalls[0].name).toBe('run_command')
    expect(parsed.toolCalls[0].arguments).toEqual({
      CommandLine: "grep -n 'InitWindow|BeginDrawing' mainGame.cpp",
    })

    expect(parsed.toolCalls[1].name).toBe('list_directory')
    expect(parsed.toolCalls[1].arguments).toEqual({
      DirectoryPath: '/home/faiq/data/arts/gaming2',
      Recursive: true,
      Depth: 2,
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
