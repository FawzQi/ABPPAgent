import { describe, it, expect } from 'vitest'
import { PermissionGateway } from '../../src/main/services/agent/permissions'
import type { ToolCall } from '../../src/shared/types'

describe('PermissionGateway', () => {
  it('auto-approves read-only tools regardless of mode', () => {
    const readTool: ToolCall = {
      id: '1',
      name: 'read_file',
      arguments: { AbsolutePath: '/foo/bar.txt' },
    }
    const res = PermissionGateway.evaluate(readTool, false)
    expect(res.requiresApproval).toBe(false)
    expect(res.isDangerous).toBe(false)
  })

  it('requires approval for run_command in interactive mode', () => {
    const cmdTool: ToolCall = {
      id: '2',
      name: 'run_command',
      arguments: { CommandLine: 'npm test' },
    }
    const res = PermissionGateway.evaluate(cmdTool, false)
    expect(res.requiresApproval).toBe(true)
    expect(res.isDangerous).toBe(false)
  })

  it('auto-approves normal commands in autoApprove mode', () => {
    const cmdTool: ToolCall = {
      id: '3',
      name: 'run_command',
      arguments: { CommandLine: 'npm test' },
    }
    const res = PermissionGateway.evaluate(cmdTool, true)
    expect(res.requiresApproval).toBe(false)
  })

  it('blocks or forces confirmation on destructive commands even in autoApprove mode', () => {
    const dangerousTool: ToolCall = {
      id: '4',
      name: 'run_command',
      arguments: { CommandLine: 'rm -rf /' },
    }
    const res = PermissionGateway.evaluate(dangerousTool, true)
    expect(res.requiresApproval).toBe(true)
    expect(res.isDangerous).toBe(true)
  })
})
