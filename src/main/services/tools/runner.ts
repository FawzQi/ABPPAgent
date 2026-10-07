import { spawn, type ChildProcess } from 'node:child_process'
import type { ToolResult } from '@shared/types'

export interface ProcessRunnerOptions {
  cwd: string
  onChunk?: (chunk: string) => void
  timeoutMs?: number
}

export class ProcessRunner {
  private activeProcesses = new Map<string, ChildProcess>()

  /**
   * Run command in child process and stream chunks.
   */
  async run(
    toolCallId: string,
    commandLine: string,
    options: ProcessRunnerOptions,
  ): Promise<ToolResult> {
    if (!commandLine || typeof commandLine !== 'string' || !commandLine.trim()) {
      return {
        toolCallId,
        name: 'run_command',
        output: 'Error: No valid CommandLine specified.',
        exitCode: 1,
        isError: true,
      }
    }

    const MAX_OUTPUT_BYTES = 2 * 1024 * 1024

    return new Promise((resolve) => {
      let outputBuffer = ''
      let chunkQueue = ''
      let chunkTimer: NodeJS.Timeout | null = null
      const timeout = options.timeoutMs || 120_000
      let timer: NodeJS.Timeout | null = null

      const flushChunks = () => {
        if (chunkTimer) {
          clearTimeout(chunkTimer)
          chunkTimer = null
        }
        if (chunkQueue.length > 0 && options.onChunk) {
          const chunkToSend = chunkQueue
          chunkQueue = ''
          options.onChunk(chunkToSend)
        }
      }

      const handleChunk = (chunk: string) => {
        if (outputBuffer.length < MAX_OUTPUT_BYTES) {
          const remaining = MAX_OUTPUT_BYTES - outputBuffer.length
          outputBuffer += chunk.slice(0, remaining)
          if (chunk.length > remaining) {
            outputBuffer += '\n[Output truncated at 2MB limit]'
          }
        }
        if (options.onChunk) {
          chunkQueue += chunk
          if (!chunkTimer) {
            chunkTimer = setTimeout(flushChunks, 40)
          }
        }
      }

      const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
      const proc = spawn(shell, ['-c', commandLine], {
        cwd: options.cwd,
        env: { ...process.env, FORCE_COLOR: '1' },
      })

      this.activeProcesses.set(toolCallId, proc)

      proc.stdout?.on('data', (data) => handleChunk(data.toString()))
      proc.stderr?.on('data', (data) => handleChunk(data.toString()))

      proc.on('close', (code) => {
        if (timer) clearTimeout(timer)
        flushChunks()
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
        flushChunks()
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
        if (timer) clearTimeout(timer)
        flushChunks()
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
      proc.kill('SIGTERM')
      this.activeProcesses.delete(toolCallId)
      return true
    }
    return false
  }
}
