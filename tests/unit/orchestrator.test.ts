import { describe, it, expect } from 'vitest'
import { ToolCallParser } from '../../src/main/services/agent/parser'
import { buildSystemPrompt } from '../../src/main/services/agent/prompt'
import { AgentDoubtDetector, AgentIntentDetector } from '../../src/main/services/agent/orchestrator'

describe('Agent Orchestration Flow', () => {
  it('builds system prompt with workspace path', () => {
    const prompt = buildSystemPrompt('/test/workspace')
    expect(prompt).toContain('/test/workspace')
    expect(prompt).toContain('run_command')
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('write_file')
    expect(prompt).toContain('"tool_call_name"')
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

    const nextPromptMarkdown = ToolCallParser.formatToolResult(toolResult1)
    expect(nextPromptMarkdown).toContain('### Tool Result: `read_file`')
    expect(nextPromptMarkdown).toContain('port')

    // Turn 2 Assistant Response (final answer, no tools)
    const turn2AssistantRaw = `<thought>
The config specifies port 3000. Everything is properly set up.
</thought>
The configuration uses port 3000 and is complete.`

    const parsed2 = ToolCallParser.parse(turn2AssistantRaw)
    expect(parsed2.toolCalls.length).toBe(0)
    expect(parsed2.cleanContent).toContain('The configuration uses port 3000')
  })

  it('detects when agent falsely doubts its tool availability or asks user to run shell commands', () => {
    // The exact statements from the audit failure trace
    const doubtSample1 = `The problem is that the file-editing tools I was using earlier are no longer available to me in this turn. My current toolset only exposes web search/browsing tools, so I can't read back the file or repair it directly.`
    expect(AgentDoubtDetector.hasDoubtOrHelplessness(doubtSample1)).toBe(true)

    const doubtSample2 = `Could you run:\nwc -c src/components/MembersSection.tsx\nhead -20 src/components/MembersSection.tsx\nand paste the output?`
    expect(AgentDoubtDetector.hasDoubtOrHelplessness(doubtSample2)).toBe(true)

    const doubtSample3 = `Please restore the affected files from git with git checkout -- src/components/MembersSection.tsx and I'll redo them cleanly.`
    expect(AgentDoubtDetector.hasDoubtOrHelplessness(doubtSample3)).toBe(true)

    // Normal statement should NOT trigger doubt
    const normalResponse = `I have finished updating the component. Everything builds cleanly with npm run build.`
    expect(AgentDoubtDetector.hasDoubtOrHelplessness(normalResponse)).toBe(false)
  })

  it('specifies tool batching and single read_file_full rule in system prompt', () => {
    const prompt = buildSystemPrompt('/test/workspace')
    expect(prompt).toContain('Batching rule: You MAY batch multiple tool calls in a single turn')
    expect(prompt).toContain('NEVER batch or stack `read_file_full`')
  })

  it('successfully parses multiple stacked tool calls in a single turn', () => {
    const stackedTurn = `<thought>
I will read both the header and footer components simultaneously.
</thought>
Let me read both files at once:
<tool_call name="read_file">
{
  "AbsolutePath": "src/Header.tsx"
}
</tool_call>
<tool_call name="read_file">
{
  "AbsolutePath": "src/Footer.tsx"
}
</tool_call>`

    const parsed = ToolCallParser.parse(stackedTurn)
    expect(parsed.toolCalls.length).toBe(2)
    expect(parsed.toolCalls[0].name).toBe('read_file')
    expect(parsed.toolCalls[0].arguments.AbsolutePath).toBe('src/Header.tsx')
    expect(parsed.toolCalls[1].name).toBe('read_file')
    expect(parsed.toolCalls[1].arguments.AbsolutePath).toBe('src/Footer.tsx')
  })

  it('successfully parses stacked simple CLI commands like list_directory and grep_search', () => {
    const stackedTurn = `<thought>
I will list the directory and search for usages in parallel.
</thought>
<tool_call name="list_directory">
{
  "DirectoryPath": "src/components"
}
</tool_call>
<tool_call name="grep_search">
{
  "Query": "export const Header"
}
</tool_call>`

    const parsed = ToolCallParser.parse(stackedTurn)
    expect(parsed.toolCalls.length).toBe(2)
    expect(parsed.toolCalls[0].name).toBe('list_directory')
    expect(parsed.toolCalls[1].name).toBe('grep_search')
  })

  it('detects unfulfilled action statements when no tool calls are present', () => {
    // The exact phrase from user audit trace where agent stopped prematurely
    const intent1 = `Now let me read the PersonModal component to understand the card info layout:`
    expect(AgentIntentDetector.isUnfulfilledAction(intent1)).toBe(true)

    const intent2 = `Let me explore the client and src directories.`
    expect(AgentIntentDetector.isUnfulfilledAction(intent2)).toBe(true)

    const intent3 = `I will start by exploring the repository structure to find the people tab.`
    expect(AgentIntentDetector.isUnfulfilledAction(intent3)).toBe(true)

    const intent4 = `Let me look at PersonModal.tsx to understand the card info layout.`
    expect(AgentIntentDetector.isUnfulfilledAction(intent4)).toBe(true)

    // Completed task statements should NOT trigger unfulfilled action
    const completion1 = `I have finished updating the component. Everything builds cleanly with npm run build.`
    expect(AgentIntentDetector.isUnfulfilledAction(completion1)).toBe(false)

    const completion2 = `All changes have been made and the task is completed successfully.`
    expect(AgentIntentDetector.isUnfulfilledAction(completion2)).toBe(false)
  })

  it('enforces strict JSON protocol, reread policy and finish in system prompt', () => {
    const prompt = buildSystemPrompt('/test/workspace', 'PROJECT CONTEXT INFO')
    expect(prompt).toContain('Strict Output Format')
    expect(prompt).toContain('no XML, no proprietary tokens')
    expect(prompt).toContain('Never repeat an identical tool call')
    expect(prompt).toContain('Context-First Policy')
    expect(prompt).toContain('"tool_call_name": "finish"')
    expect(prompt).toContain('For a single tool call:')
    expect(prompt).toContain('PROJECT CONTEXT INFO')
  })
})
