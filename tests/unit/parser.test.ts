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

  it('gracefully salvages DSML format into valid tool calls to prevent infinite format loops', () => {
    const raw = `<thought>
Examining the main game file.
</thought>
Let me examine mainGame.cpp structure.

<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="run_command">
<｜｜DSML｜｜ parameter name="CommandLine" string="true">grep -n 'InitWindow|BeginDrawing' mainGame.cpp</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.toolCalls.length).toBe(1)
    expect(parsed.toolCalls[0].name).toBe('run_command')
    expect(parsed.toolCalls[0].arguments).toEqual({
      CommandLine: "grep -n 'InitWindow|BeginDrawing' mainGame.cpp",
    })
    expect(parsed.cleanContent).toBe('Let me examine mainGame.cpp structure.')
  })

  it('salvages DSML format with JSON body', () => {
    const raw = `<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="grep_search">
{
  "Query": "(?i)research.?interest",
  "Path": "."
}
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.toolCalls.length).toBe(1)
    expect(parsed.toolCalls[0].name).toBe('grep_search')
    expect(parsed.toolCalls[0].arguments).toEqual({
      Query: '(?i)research.?interest',
      Path: '.',
    })
  })

  it('parses standard XML tool calls reliably with complex JSON parameters', () => {
    const raw = `<thought>
Searching codebase for people tab.
</thought>
I will search for the people tab components.
<tool_call name="grep_search">
{
  "Query": "[Rr]esearch [Ii]nterest",
  "Path": "src/contents"
}
</tool_call>`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.toolCalls.length).toBe(1)
    expect(parsed.toolCalls[0].name).toBe('grep_search')
    expect(parsed.toolCalls[0].arguments).toEqual({
      Query: '[Rr]esearch [Ii]nterest',
      Path: 'src/contents',
    })
    expect(parsed.cleanContent).toBe('I will search for the people tab components.')
  })

  it('handles abandoned unclosed tags followed by valid tool calls', () => {
    const raw = `Let me read the control function.

<tool_call name="read_file">

read what file?
The user is asking what file. Let me read mainGame.cpp.

<tool_call name="read_file">
{
  "AbsolutePath": "/home/faiq/mainGame.cpp",
  "StartLine": 2154
}
</tool_call>`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.toolCalls.length).toBe(1)
    expect(parsed.toolCalls[0].name).toBe('read_file')
    expect(parsed.toolCalls[0].arguments).toEqual({
      AbsolutePath: '/home/faiq/mainGame.cpp',
      StartLine: 2154,
    })
  })

  it('detects tool call attempts even when broken', () => {
    expect(ToolCallParser.hasToolCallAttempt('<tool_call name="read_file"> broken content')).toBe(true)
    expect(ToolCallParser.hasToolCallAttempt('<||DSML|| invoke name="run_command">')).toBe(true)
    expect(ToolCallParser.hasToolCallAttempt('Just plain conversational response with no tools')).toBe(false)
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

  it('safely extracts CodeContent containing unescaped quotes without truncating to 25 bytes', () => {
    // Exact failure case from the audit log
    const raw = `<tool_call name="write_file">
{
  "TargetFile": "src/components/MembersSection.tsx",
  "CodeContent": "import { useState } from "react";
import { translations } from "../contents/translations";

export function MembersSection() {
  return <div>Members</div>;
}
"
}
</tool_call>`

    const parsed = ToolCallParser.parse(raw)
    expect(parsed.toolCalls.length).toBe(1)
    expect(parsed.toolCalls[0].name).toBe('write_file')
    expect(parsed.toolCalls[0].arguments.TargetFile).toBe('src/components/MembersSection.tsx')
    // Crucial check: length must NOT be 25 bytes!
    expect(parsed.toolCalls[0].arguments.CodeContent.length).toBeGreaterThan(100)
    expect(parsed.toolCalls[0].arguments.CodeContent).toContain('MembersSection')
    expect(parsed.toolCalls[0].arguments.CodeContent).toContain('translations')
  })

  it('rejects truncated single-line code fragments in write_file so format recovery can trigger', () => {
    const raw = `<tool_call name="write_file">
{
  "TargetFile": "src/components/MembersSection.tsx",
  "CodeContent": "import { useState } from "
}
</tool_call>`

    const parsed = ToolCallParser.parse(raw)
    // Should be filtered out to prevent 25-byte destructive writes
    expect(parsed.toolCalls.length).toBe(0)
    expect(ToolCallParser.hasToolCallAttempt(raw)).toBe(true)
  })
})
