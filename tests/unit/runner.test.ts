import { describe, it, expect } from 'vitest'
import { ProcessRunner } from '../../src/main/services/tools/runner'

describe('ProcessRunner', () => {
  const runner = new ProcessRunner()

  it('rejects empty or undefined command line cleanly', async () => {
    // @ts-ignore test invalid input
    const res = await runner.run('call_1', undefined, { cwd: process.cwd() })
    expect(res.isError).toBe(true)
    expect(res.exitCode).toBe(1)
    expect(res.output).toContain('No valid CommandLine specified')
  })

  it('executes a basic command successfully', async () => {
    const res = await runner.run('call_2', 'echo "hello runner"', { cwd: process.cwd() })
    expect(res.isError).toBe(false)
    expect(res.exitCode).toBe(0)
    expect(res.output.trim()).toBe('hello runner')
  })
})
