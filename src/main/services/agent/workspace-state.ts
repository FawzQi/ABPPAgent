import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import type { ToolCall } from '@shared/types'

const PATH_KEYS = ['AbsolutePath', 'TargetFile', 'DirectoryPath', 'Cwd'] as const

const REQUIRED: Record<string, string[]> = {
  run_command: ['CommandLine'],
  read_file: ['AbsolutePath'],
  read_file_full: ['AbsolutePath'],
  copy_file_to_chat: ['AbsolutePath'],
  write_file: ['TargetFile', 'CodeContent'],
  replace_file_content: ['TargetFile', 'TargetContent', 'ReplacementContent'],
  grep_search: ['Query'],
  gitnexus_query: ['Query'],
  gitnexus_context: ['Target'],
  ask_user: ['Question'],
}

/**
 * Tool gate: checks required args, strips markdown-link wrappers from path args,
 * rejects non-filesystem paths and paths outside the workspace, and rewrites
 * path args to absolute. Returns an error string, or null when the call is valid.
 */
export function validateCall(call: ToolCall, workspace: string): string | null {
  const args = call.arguments ?? (call.arguments = {})
  const missing = (REQUIRED[call.name] ?? []).filter((k) => args[k] == null)
  if (missing.length) {
    return `Error: invalid_args: ${call.name} is missing ${missing.map((k) => `"${k}"`).join(', ')}.`
  }
  for (const key of PATH_KEYS) {
    if (typeof args[key] !== 'string') continue
    // "/ws/[src/a.ts](https://x/src/a.ts)" -> "/ws/src/a.ts"
    const p = args[key].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    if (/https?:|`|\]\(/.test(p)) {
      return `Error: invalid_path: "${args[key]}" is not a filesystem path. Use a plain path like "src/App.tsx" (no URLs or markdown).`
    }
    const abs = path.resolve(workspace, p)
    const rel = path.relative(workspace, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return `Error: invalid_path: "${args[key]}" is outside the workspace (${workspace}).`
    }
    args[key] = abs
  }
  return null
}

export function fileInfo(abs: string): { sha: string; bytes: number } | null {
  try {
    const buf = fs.readFileSync(abs)
    return { sha: createHash('sha256').update(buf).digest('hex').slice(0, 12), bytes: buf.length }
  } catch {
    return null
  }
}

// Per-session map of files whose full, current content the model already has.
const known = new Map<string, Map<string, { sha: string; rereads: number }>>()
const forFiles = (sessionId: string) => {
  let m = known.get(sessionId)
  if (!m) known.set(sessionId, (m = new Map()))
  return m
}

/** Record that the model now holds the full current content of `abs`. Returns true if it already did. */
export function markKnown(sessionId: string, abs: string): boolean {
  const info = fileInfo(abs)
  if (!info) return false
  const files = forFiles(sessionId)
  const prev = files.get(abs)
  if (prev?.sha === info.sha) return true
  files.set(abs, { sha: info.sha, rereads: 0 })
  return false
}

/** Forget a file (after we write it) so the next read is treated as fresh. */
export function forget(sessionId: string, abs: string): void {
  forFiles(sessionId).delete(abs)
}

/**
 * Decide whether a full read is redundant. First redundant reread: 'warn' (allowed).
 * Further ones: 'block'. Changed or never-seen files: 'ok'.
 */
export function checkReread(sessionId: string, abs: string): 'ok' | 'warn' | 'block' {
  const info = fileInfo(abs)
  if (!info) return 'ok'
  const files = forFiles(sessionId)
  const prev = files.get(abs)
  if (!prev || prev.sha !== info.sha) {
    files.set(abs, { sha: info.sha, rereads: 0 })
    return 'ok'
  }
  prev.rereads++
  return prev.rereads === 1 ? 'warn' : 'block'
}

/** Opt-in: run `tsc --noEmit` in the workspace and summarize. Empty string if no tsconfig. */
export function typecheck(workspace: string, env: NodeJS.ProcessEnv): Promise<string> {
  const tsc = path.join(workspace, 'node_modules/.bin/tsc')
  if (!fs.existsSync(path.join(workspace, 'tsconfig.json')) || !fs.existsSync(tsc)) return Promise.resolve('')
  return new Promise((resolve) => {
    execFile(tsc, ['--noEmit'], { cwd: workspace, env, timeout: 60_000, maxBuffer: 10_000_000 }, (err, stdout) => {
      if (!err) return resolve('[typecheck: passed]')
      const lines = String(stdout || err.message).split('\n').filter(Boolean).slice(0, 20)
      resolve(`[typecheck: FAILED]\n${lines.join('\n')}`)
    })
  })
}
