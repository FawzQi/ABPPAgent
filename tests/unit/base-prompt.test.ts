import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_BASE_PROMPT_TEMPLATE,
  getBasePrompt,
  saveBasePrompt,
  resetBasePrompt,
} from '../../src/main/services/agent/base-prompt'
import { buildSystemPrompt } from '../../src/main/services/agent/prompt'
import { getStorageDir } from '../../src/main/services/db/database'
import { DEFAULT_CUSTOM_TOOLS_CONFIG } from '../../src/shared/types'

describe('base prompt service and template interpolation', () => {
  const promptFile = path.join(getStorageDir(), 'base-prompt.txt')

  beforeEach(() => {
    try {
      if (fs.existsSync(promptFile)) {
        fs.unlinkSync(promptFile)
      }
    } catch {
      // ignore
    }
  })

  afterEach(() => {
    try {
      if (fs.existsSync(promptFile)) {
        fs.unlinkSync(promptFile)
      }
    } catch {
      // ignore
    }
  })

  it('contains placeholders in DEFAULT_BASE_PROMPT_TEMPLATE', () => {
    expect(DEFAULT_BASE_PROMPT_TEMPLATE).toContain('{{workspacePath}}')
    expect(DEFAULT_BASE_PROMPT_TEMPLATE).toContain('{{projectContext}}')
    expect(DEFAULT_BASE_PROMPT_TEMPLATE).toContain('{{availableTools}}')
  })

  it('returns default prompt when no custom prompt is saved', () => {
    const info = getBasePrompt()
    expect(info.isCustom).toBe(false)
    expect(info.current).toBe(DEFAULT_BASE_PROMPT_TEMPLATE)
    expect(info.defaultPrompt).toBe(DEFAULT_BASE_PROMPT_TEMPLATE)
  })

  it('saves and reads custom base prompt', () => {
    const custom = 'My Custom Base Prompt for {{workspacePath}}\n{{availableTools}}'
    saveBasePrompt(custom)

    const info = getBasePrompt()
    expect(info.isCustom).toBe(true)
    expect(info.current).toBe(custom)
  })

  it('resets base prompt back to default', () => {
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
