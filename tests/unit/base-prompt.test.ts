import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_BASE_PROMPT_TEMPLATE,
  DEFAULT_PER_TURN_SUFFIX_TEMPLATE,
  DEFAULT_RECOVERY_PROMPT_TEMPLATE,
  getBasePrompt,
  saveBasePrompt,
  resetBasePrompt,
  getAllPrompts,
  savePrompt,
  resetPrompt,
  resetAllPrompts,
} from '../../src/main/services/agent/base-prompt'
import { buildSystemPrompt } from '../../src/main/services/agent/prompt'
import { getStorageDir } from '../../src/main/services/db/database'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '../../src/shared/types'

describe('base prompt service and template interpolation', () => {
  const promptFile = path.join(getStorageDir(), 'base-prompt.txt')
  const jsonPromptFile = path.join(getStorageDir(), 'custom-prompts.json')

  const cleanup = () => {
    try {
      if (fs.existsSync(promptFile)) fs.unlinkSync(promptFile)
    } catch {}
    try {
      if (fs.existsSync(jsonPromptFile)) fs.unlinkSync(jsonPromptFile)
    } catch {}
  }

  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('contains placeholders in default templates', () => {
    expect(DEFAULT_BASE_PROMPT_TEMPLATE).toContain('{{workspacePath}}')
    expect(DEFAULT_BASE_PROMPT_TEMPLATE).toContain('{{projectContext}}')
    expect(DEFAULT_BASE_PROMPT_TEMPLATE).toContain('{{availableTools}}')
    expect(DEFAULT_PER_TURN_SUFFIX_TEMPLATE).toContain('Strict Response Requirement (MANDATORY)')
    expect(DEFAULT_RECOVERY_PROMPT_TEMPLATE).toContain('{{availableTools}}')
    expect(DEFAULT_RECOVERY_PROMPT_TEMPLATE).toContain('{{details}}')
  })

  it('returns default prompts for all keys when none are customized', () => {
    const all = getAllPrompts()
    expect(all.basePrompt.isCustom).toBe(false)
    expect(all.basePrompt.current).toBe(DEFAULT_BASE_PROMPT_TEMPLATE)
    expect(all.perTurnSuffix.isCustom).toBe(false)
    expect(all.perTurnSuffix.current).toBe(DEFAULT_PER_TURN_SUFFIX_TEMPLATE)
    expect(all.recoveryPrompt.isCustom).toBe(false)
    expect(all.recoveryPrompt.current).toBe(DEFAULT_RECOVERY_PROMPT_TEMPLATE)
  })

  it('saves and reads custom prompts for all keys', () => {
    savePrompt('basePrompt', 'Custom base for {{workspacePath}}')
    savePrompt('perTurnSuffix', 'Custom suffix rule for: {{prompt}}')
    savePrompt('recoveryPrompt', 'Custom recovery warning with {{details}}')

    const all = getAllPrompts()
    expect(all.basePrompt.isCustom).toBe(true)
    expect(all.basePrompt.current).toBe('Custom base for {{workspacePath}}')
    expect(all.perTurnSuffix.isCustom).toBe(true)
    expect(all.perTurnSuffix.current).toBe('Custom suffix rule for: {{prompt}}')
    expect(all.recoveryPrompt.isCustom).toBe(true)
    expect(all.recoveryPrompt.current).toBe('Custom recovery warning with {{details}}')
  })

  it('resets a single prompt key while keeping others customized', () => {
    savePrompt('basePrompt', 'Custom base prompt')
    savePrompt('perTurnSuffix', 'Custom suffix rule')

    resetPrompt('basePrompt')

    const all = getAllPrompts()
    expect(all.basePrompt.isCustom).toBe(false)
    expect(all.basePrompt.current).toBe(DEFAULT_BASE_PROMPT_TEMPLATE)
    expect(all.perTurnSuffix.isCustom).toBe(true)
    expect(all.perTurnSuffix.current).toBe('Custom suffix rule')
  })

  it('resets all prompts at once', () => {
    savePrompt('basePrompt', 'Custom base')
    savePrompt('perTurnSuffix', 'Custom suffix')
    savePrompt('recoveryPrompt', 'Custom recovery')

    const reset = resetAllPrompts()
    expect(reset.basePrompt.isCustom).toBe(false)
    expect(reset.perTurnSuffix.isCustom).toBe(false)
    expect(reset.recoveryPrompt.isCustom).toBe(false)
  })

  it('migrates legacy base-prompt.txt seamlessly if custom-prompts.json does not exist', () => {
    fs.writeFileSync(promptFile, 'Legacy custom base prompt content', 'utf8')

    const all = getAllPrompts()
    expect(all.basePrompt.isCustom).toBe(true)
    expect(all.basePrompt.current).toBe('Legacy custom base prompt content')
  })

  it('resets base prompt back to default via legacy helper', () => {
    saveBasePrompt('Temporary custom prompt')
    expect(getBasePrompt().isCustom).toBe(true)

    const reset = resetBasePrompt()
    expect(reset).toBe(DEFAULT_BASE_PROMPT_TEMPLATE)
    expect(getBasePrompt().isCustom).toBe(false)
  })

  it('interpolates placeholders in customTemplate using buildSystemPrompt', () => {
    const customTemplate = `# Custom Header
Directory: {{workspacePath}}
Context: {{projectContext}}
Tools:
{{availableTools}}
Done.`

    const result = buildSystemPrompt(
      '/my/repo',
      'Codebase summary here',
      DEFAULT_CUSTOM_TOOLS_CONFIG,
      customTemplate,
    )

    expect(result).toContain('Directory: /my/repo')
    expect(result).toContain('Context: Codebase summary here')
    expect(result).toContain('run_command')
    expect(result).toContain('read_file')
    expect(result).not.toContain('{{workspacePath}}')
    expect(result).not.toContain('{{projectContext}}')
    expect(result).not.toContain('{{availableTools}}')
  })

  it('safely ensures workspacePath and availableTools are present if omitted from custom template', () => {
    const minimalistTemplate = `# Super Minimal Agent
Please solve coding problems step by step.`

    const result = buildSystemPrompt(
      '/minimal/path',
      undefined,
      DEFAULT_CUSTOM_TOOLS_CONFIG,
      minimalistTemplate,
    )

    expect(result).toContain('# Super Minimal Agent')
    expect(result).toContain('## Workspace Directory\n/minimal/path')
    expect(result).toContain('## Available Tools')
    expect(result).toContain('run_command')
  })
})
