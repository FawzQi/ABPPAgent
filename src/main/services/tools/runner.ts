import { spawn, type ChildProcess } from 'node:child_process'
import type { ToolResult } from '@shared/types'

export interface ProcessRunnerOptions {
  cwd: string
  onChunk?: (chunk: string) => void
  timeoutMs?: number
}

export class ProcessRunner {
  private activeProcesses = new Map<string, ChildProcess | any>()

  /**
   * Run command in child process or pseudo-terminal and stream chunks.
   */
  async run(
    toolCallId: string,
    commandLine: string,
    options: ProcessRunnerOptions,
  ): Promise<ToolResult> {
    let ptyModule: any = null
    try {
      ptyModule = await import('node-pty')
    } catch {
      // Fall back to child_process
    }

    return new Promise((resolve) => {
      let outputBuffer = ''
      const timeout = options.timeoutMs || 120_000
      let timer: NodeJS.Timeout | null = null

      const handleChunk = (chunk: string) => {
        outputBuffer += chunk
        if (options.onChunk) {
          options.onChunk(chunk)
        }
      }

      if (ptyModule && typeof ptyModule.spawn === 'function') {
        try {
          const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
          const ptyProcess = ptyModule.spawn(shell, ['-c', commandLine], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: options.cwd,
            env: process.env as Record<string, string>,
          })

          this.activeProcesses.set(toolCallId, ptyProcess)

          ptyProcess.onData((data: string) => {
            handleChunk(data)
          })

          ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
            if (timer) clearTimeout(timer)
            this.activeProcesses.delete(toolCallId)
            resolve({
              toolCallId,
              name: 'run_command',
              output: outputBuffer,
              exitCode,
              isError: exitCode !== 0,
            })
          })

          timer = setTimeout(() => {
            ptyProcess.kill()
            resolve({
              toolCallId,
              name: 'run_command',
              output: `${outputBuffer}\n[Process timed out after ${timeout}ms]`,
              exitCode: -1,
              isError: true,
            })
          }, timeout)
          return
        } catch {
          // Fall through to spawn
        }
      }

      // Standard child_process fallback
      const proc = spawn(commandLine, {
        cwd: options.cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' },
      })

      this.activeProcesses.set(toolCallId, proc)

      proc.stdout?.on('data', (data) => handleChunk(data.toString()))
      proc.stderr?.on('data', (data) => handleChunk(data.toString()))

      proc.on('close', (code) => {
        if (timer) clearTimeout(timer)
        this.activeProcesses.delete(toolCallId)
        const exitCode = code ?? 0
        resolve({
          toolCallId,
          name: 'run_command',
          output: outputBuffer,
          exitCode,
          isError: exitCode !== 0,
        })
      })

      proc.on('error', (err) => {
        if (timer) clearTimeout(timer)
        this.activeProcesses.delete(toolCallId)
        resolve({
          toolCallId,
          name: 'run_command',
          output: `${outputBuffer}\n[Error: ${err.message}]`,
          exitCode: 1,
          isError: true,
        })
      })

      timer = setTimeout(() => {
        proc.kill('SIGTERM')
        resolve({
          toolCallId,
          name: 'run_command',
          output: `${outputBuffer}\n[Process timed out after ${timeout}ms]`,
          exitCode: -1,
          isError: true,
        })
      }, timeout)
    })
  }

  /**
   * Terminate active process.
   */
  kill(toolCallId: string): boolean {
    const proc = this.activeProcesses.get(toolCallId)
    if (proc) {
      if (typeof proc.kill === 'function') {
        proc.kill()
      }
      this.activeProcesses.delete(toolCallId)
      return true
    }
    return false
  }
}
