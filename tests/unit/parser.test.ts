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

  it('formats tool results into Markdown format for next turn', () => {
    const result = {
      toolCallId: 'call_123',
      name: 'run_command',
      output: 'All 5 tests passed',
      exitCode: 0,
      isError: false,
    }

    const md = ToolCallParser.formatToolResult(result)
    expect(md).toContain('### Tool Result: `run_command`')
    expect(md).toContain('- **Status**: Success')
    expect(md).toContain('- **Exit Code**: 0')
    expect(md).toContain('All 5 tests passed')
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

describe('ToolCallParser JSON envelope', () => {
  const call = '{"thought":"look","tool_call_name":"read_file","parameter":{"AbsolutePath":"src/a.ts"}}'

  it('parses a plain envelope', () => {
    const p = ToolCallParser.parse(call)
    expect(p.thinking?.content).toBe('look')
    expect(p.toolCalls).toHaveLength(1)
    expect(p.toolCalls[0].name).toBe('read_file')
    expect(p.toolCalls[0].arguments.AbsolutePath).toBe('src/a.ts')
  })

  it('tolerates fences and surrounding prose', () => {
    const p = ToolCallParser.parse('Sure!\n```json\n' + call + '\n```\nDone.')
    expect(p.toolCalls[0].name).toBe('read_file')
  })

  it('salvages unescaped quotes in code content', () => {
    const raw = '{"thought":"write","tool_call_name":"write_file","parameter":{"TargetFile":"a.ts","CodeContent":"const s = "hi";\nexport {}"}}'
    const p = ToolCallParser.parse(raw)
    expect(p.toolCalls[0].name).toBe('write_file')
    expect(p.toolCalls[0].arguments.TargetFile).toBe('a.ts')
    expect(p.toolCalls[0].arguments.CodeContent).toContain('const s = "hi";')
  })

  it('finish ends the task with its summary', () => {
    const p = ToolCallParser.parse('{"thought":"ok","tool_call_name":"finish","parameter":{"summary":"All done"}}')
    expect(p.finished).toBe(true)
    expect(p.cleanContent).toBe('All done')
    expect(p.toolCalls).toHaveLength(0)
  })

  it('reports a format error when tool_call_name is not a string', () => {
    const p = ToolCallParser.parse('{"thought":"x","tool_call_name":null,"parameter":{}}')
    expect(p.formatError).toMatch(/finish/)
    expect(p.toolCalls).toHaveLength(0)
  })

  it('parses batched tool calls in a JSON array', () => {
    const batch = `[
      {"thought":"Inspect dir","tool_call_name":"list_directory","parameter":{"DirectoryPath":"src"}},
      {"thought":"Search App","tool_call_name":"grep_search","parameter":{"Query":"App"}}
    ]`
    const p = ToolCallParser.parse(batch)
    expect(p.toolCalls).toHaveLength(2)
    expect(p.toolCalls[0].name).toBe('list_directory')
    expect(p.toolCalls[0].arguments.DirectoryPath).toBe('src')
    expect(p.toolCalls[1].name).toBe('grep_search')
    expect(p.toolCalls[1].arguments.Query).toBe('App')
  })

  it('parses multiple consecutive JSON tool envelopes', () => {
    const multi = `{"thought":"one","tool_call_name":"list_directory","parameter":{"DirectoryPath":"."}}
{"thought":"two","tool_call_name":"grep_search","parameter":{"Query":"main"}}`
    const p = ToolCallParser.parse(multi)
    expect(p.toolCalls).toHaveLength(2)
    expect(p.toolCalls[0].name).toBe('list_directory')
    expect(p.toolCalls[1].name).toBe('grep_search')
  })
})
