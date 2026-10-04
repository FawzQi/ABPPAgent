import { describe, it, expect } from 'vitest'
import {
  formatAvailableTools,
  appendToolJsonFormatRule,
  buildToolFormatWarningPrompt,
  buildSystemPrompt,
} from '../../src/main/services/agent/prompt'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '../../src/shared/types'

describe('prompt formatting and tools rule helpers', () => {
  it('formats all enabled available tools with descriptions and schemas', () => {
    const tools = formatAvailableTools(DEFAULT_CUSTOM_TOOLS_CONFIG)
    expect(tools).toContain('run_command')
    expect(tools).toContain('read_file')
    expect(tools).toContain('read_file_full')
    expect(tools).toContain('write_file')
    expect(tools).toContain('replace_file_content')
    expect(tools).toContain('list_directory')
    expect(tools).toContain('ask_user')
    expect(tools).toContain('finish')
    expect(tools).toContain('gitnexus_query')
    expect(tools).toContain('grep_search')
  })

  it('appends mandatory tool JSON format rule to the bottom of any prompt', () => {
    const prompt = 'Please implement feature X in the project.'
    const result = appendToolJsonFormatRule(prompt)

    expect(result.startsWith(prompt)).toBe(true)
    expect(result).toContain('### Strict Response Requirement (MANDATORY)')
    expect(result).toContain('"tool_call_name": "<name of tool from AVAILABLE TOOLS>"')
    expect(result).toContain('"tool_call_name": "finish"')

    // Calling it again should not duplicate the rule
    const duplicated = appendToolJsonFormatRule(result)
    const matches = duplicated.match(/Strict Response Requirement \(MANDATORY\)/g)
    expect(matches?.length).toBe(1)
  })

  it('builds a warning prompt with complete tool list format when LLM fails to reply in tool format', () => {
    const warning = buildToolFormatWarningPrompt(DEFAULT_CUSTOM_TOOLS_CONFIG, 'Response was plain text')
    expect(warning).toContain('# WARNING: Response Must Be in Tools JSON Format!')
    expect(warning).toContain('Response was plain text')
    expect(warning).toContain('## Complete Available Tools & Parameter Schemas:')
    expect(warning).toContain('run_command')
    expect(warning).toContain('read_file')
    expect(warning).toContain('write_file')
    expect(warning).toContain('finish')
  })

  it('builds system prompt with available tools and strict output format instructions', () => {
    const sysPrompt = buildSystemPrompt('/data/workspace', '# Context', DEFAULT_CUSTOM_TOOLS_CONFIG)
    expect(sysPrompt).toContain('/data/workspace')
    expect(sysPrompt).toContain('# Context')
    expect(sysPrompt).toContain('## Available Tools')
    expect(sysPrompt).toContain('## Strict Output Format (Every Reply)')
  })
})
