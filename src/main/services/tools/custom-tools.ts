import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { clipboard } from 'electron'
import type { ToolResult } from '@shared/types'

export function getExtendedEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || ''
  const extraPaths = [
    path.join(home, '.nvm/versions/node/v24.15.0/bin'),
    path.join(home, '.local/bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
  const currentPath = process.env.PATH || ''
  const newPath = `${extraPaths.join(':')}:${currentPath}`
  return { ...process.env, PATH: newPath }
}

function runCliCommand(cwd: string, cmd: string, args: string[], timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: getExtendedEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let completed = false

    const timer = setTimeout(() => {
      if (!completed) {
        completed = true
        child.kill('SIGKILL')
        resolve({ stdout, stderr: `${stderr}\nCommand timed out after ${timeoutMs / 1000}s`, exitCode: 124 })
      }
    }, timeoutMs)

    child.stdout?.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', (err) => {
      if (!completed) {
        completed = true
        clearTimeout(timer)
        resolve({ stdout, stderr: err.message, exitCode: 1 })
      }
    })
    child.on('close', (code) => {
      if (!completed) {
        completed = true
        clearTimeout(timer)
        resolve({ stdout, stderr, exitCode: code ?? 0 })
      }
    })
  })
}

export class CustomToolsService {
  /**
   * Reads an entire file without pagination or line numbering.
   */
  static readFileFull(toolCallId: string, filePath: string): ToolResult {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          toolCallId,
          name: 'read_file_full',
          output: `Error: File not found: ${filePath}`,
          isError: true,
        }
      }
      const stats = fs.statSync(filePath)
      if (stats.isDirectory()) {
        return {
          toolCallId,
          name: 'read_file_full',
          output: `Error: Path is a directory, not a file: ${filePath}`,
          isError: true,
        }
      }
      // Warn if huge (> 2MB)
      if (stats.size > 2 * 1024 * 1024) {
        return {
          toolCallId,
          name: 'read_file_full',
          output: `Error: File is too large to read in full (${(stats.size / 1024 / 1024).toFixed(2)} MB). Please use read_file with line ranges instead.`,
          isError: true,
        }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      return {
        toolCallId,
        name: 'read_file_full',
        output: content,
        isError: false,
      }
    } catch (err: any) {
      return {
        toolCallId,
        name: 'read_file_full',
        output: `Error reading file: ${err.message}`,
        isError: true,
      }
    }
  }

  /**
   * Copies the whole file to system clipboard and delivers full formatted representation to chat context.
   */
  static copyFileToChat(toolCallId: string, filePath: string): ToolResult {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          toolCallId,
          name: 'copy_file_to_chat',
          output: `Error: File not found: ${filePath}`,
          isError: true,
        }
      }
      const stats = fs.statSync(filePath)
      if (stats.isDirectory()) {
        return {
          toolCallId,
          name: 'copy_file_to_chat',
          output: `Error: Path is a directory: ${filePath}`,
          isError: true,
        }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const formatted = `=== FILE START: ${filePath} ===\n${content}\n=== FILE END: ${filePath} ===`

      try {
        clipboard.writeText(formatted)
      } catch {
        // clipboard write optional fallback
      }

      return {
        toolCallId,
        name: 'copy_file_to_chat',
        output: `Successfully loaded whole file into chat context and clipboard (${content.length} characters):\n\n${formatted}`,
        isError: false,
      }
    } catch (err: any) {
      return {
        toolCallId,
        name: 'copy_file_to_chat',
        output: `Error copying file to chat: ${err.message}`,
        isError: true,
      }
    }
  }

  /**
   * Runs gitnexus query in the workspace.
   */
  static async gitnexusQuery(toolCallId: string, workspacePath: string, query: string): Promise<ToolResult> {
    const res = await runCliCommand(workspacePath, 'gitnexus', ['query', query])
    const output = (res.stdout + (res.stderr ? `\nSTDERR:\n${res.stderr}` : '')).trim()
    return {
      toolCallId,
      name: 'gitnexus_query',
      output: output || '(No output returned from gitnexus query)',
      isError: res.exitCode !== 0,
      exitCode: res.exitCode,
    }
  }

  /**
   * Runs gitnexus context in the workspace.
   */
  static async gitnexusContext(toolCallId: string, workspacePath: string, target: string): Promise<ToolResult> {
    const res = await runCliCommand(workspacePath, 'gitnexus', ['context', target])
    const output = (res.stdout + (res.stderr ? `\nSTDERR:\n${res.stderr}` : '')).trim()
    return {
      toolCallId,
      name: 'gitnexus_context',
      output: output || '(No output returned from gitnexus context)',
      isError: res.exitCode !== 0,
      exitCode: res.exitCode,
    }
  }

  /**
   * Runs fast grep search in the workspace.
   */
  static async grepSearch(toolCallId: string, workspacePath: string, query: string, targetPath?: string): Promise<ToolResult> {
    const searchTarget = targetPath || '.'
    const res = await runCliCommand(workspacePath, 'grep', ['-rnEH', query, searchTarget])
    const output = (res.stdout + (res.stderr ? `\nSTDERR:\n${res.stderr}` : '')).trim()
    return {
      toolCallId,
      name: 'grep_search',
      output: output || '(No matches found)',
      isError: res.exitCode > 1, // grep returns 1 for no matches, which is not a failure
      exitCode: res.exitCode,
    }
  }
}
