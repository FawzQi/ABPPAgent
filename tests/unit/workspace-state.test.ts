import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateCall, checkReread, forget, clearSessionState } from '../../src/main/services/agent/workspace-state'
import type { ToolCall } from '../../src/shared/types'

const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
const file = path.join(ws, 'a.ts')
fs.writeFileSync(file, 'one')
const call = (name: string, args: Record<string, any>): ToolCall => ({ id: 'x', name, arguments: args }) as ToolCall

describe('validateCall', () => {
  it('strips markdown-link wrapper and absolutizes', () => {
    const c = call('read_file', { AbsolutePath: `${ws}/[a.ts](https://x.io/a.ts)` })
    expect(validateCall(c, ws)).toBeNull()
    expect(c.arguments.AbsolutePath).toBe(file)
  })
  it('rejects urls, escapes and missing args', () => {
    expect(validateCall(call('read_file', { AbsolutePath: 'https://x.io/a.ts' }), ws)).toMatch(/invalid_path/)
    expect(validateCall(call('read_file', { AbsolutePath: '../escape' }), ws)).toMatch(/outside/)
    expect(validateCall(call('write_file', { TargetFile: 'a.ts' }), ws)).toMatch(/CodeContent/)
  })
})

describe('checkReread', () => {
  it('ok, then warn once, then block; edit resets', () => {
    expect(checkReread('s', file)).toBe('ok')
    expect(checkReread('s', file)).toBe('warn')
    expect(checkReread('s', file)).toBe('block')
    fs.writeFileSync(file, 'two')
    expect(checkReread('s', file)).toBe('ok')
    forget('s', file)
    expect(checkReread('s', file)).toBe('ok')
  })

  it('clearSessionState clears all tracking for the session', () => {
    expect(checkReread('session_to_clear', file)).toBe('ok')
    expect(checkReread('session_to_clear', file)).toBe('warn')
    clearSessionState('session_to_clear')
    // After clearSessionState, reading the file again should start from 'ok' as fresh
    expect(checkReread('session_to_clear', file)).toBe('ok')
  })
})
