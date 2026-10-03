import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  GitCommitResult,
  GitDiffContent,
  GitFileChange,
  GitFileStatusCode,
  GitStatus,
} from '@shared/types'

export interface ProcessResult {
  ok: boolean
  stdout: string
  stderr: string
}

/**
  * Run `git <args>` with `cwd` set to the project root. `stdio: ignore` for
  * stdin so a Git command that would prompt for credentials or an editor
  * fails fast rather than hanging the main process.
  */
export function runGit(root: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) =>
      resolve({ ok: false, stdout, stderr: error.message }),
    )
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr }))
  })
}

/** True when the folder contains a `.git` directory or file. */
export async function isRepository(root: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, '.git'))
    return true
  } catch {
    return false
  }
}

export interface InitResult {
  created: boolean
}

/**
  * Initialize a repository in `root`. Idempotent: when `.git` already exists
  * the call is a no-op and reports `created: false`.
  */
export async function initRepository(root: string): Promise<InitResult> {
  if (await isRepository(root)) return { created: false }
  const result = await runGit(root, ['init'])
  if (!result.ok) {
    throw new Error(result.stderr.trim() || 'git init failed.')
  }
  return { created: true }
}

function mapStatusCode(code: string): GitFileStatusCode {
  switch (code) {
    case 'A':
      return 'added'
    case 'M':
      return 'modified'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'typechange'
    case 'U':
      return 'conflicted'
    default:
      return 'modified'
  }
}

function parseBranchLine(rest: string, status: GitStatus): void {
  const bracket = rest.indexOf(' [')
  const head = bracket === -1 ? rest : rest.slice(0, bracket)
  const bracketPart = bracket === -1 ? '' : rest.slice(bracket + 2, -1)

  if (head.startsWith('No commits yet on ')) {
    status.branch = head.slice('No commits yet on '.length)
    return
  }
  if (head.startsWith('Initial commit on ')) {
    status.branch = head.slice('Initial commit on '.length)
    return
  }
  if (head === 'HEAD (no branch)') {
    status.branch = null
    return
  }

  status.branch = head.split('...')[0] ?? null

  const ahead = /ahead (\d+)/.exec(bracketPart)
  const behind = /behind (\d+)/.exec(bracketPart)
  if (ahead?.[1]) status.ahead = Number(ahead[1])
  if (behind?.[1]) status.behind = Number(behind[1])
}

/**
  * Read the working-tree status. Returns `null` when the folder is not a
  * repository.
  */
export async function getStatus(root: string): Promise<GitStatus | null> {
  if (!(await isRepository(root))) return null

  const result = await runGit(root, [
    'status',
    '--porcelain=v1',
    '-z',
    '--branch',
  ])
  if (!result.ok) {
    throw new Error(result.stderr.trim() || 'git status failed.')
  }

  const status: GitStatus = {
    branch: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  }

  const fields = result.stdout.split('\0')
  let index = 0
  while (index < fields.length) {
    const entry = fields[index]
    index += 1
    if (entry === undefined || entry === '') continue

    if (entry.startsWith('## ')) {
      parseBranchLine(entry.slice(3), status)
      continue
    }

    if (entry.length < 4) continue
    const x = entry[0] ?? ' '
    const y = entry[1] ?? ' '
    const filePath = entry.slice(3)

    let oldPath: string | undefined
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      oldPath = fields[index]
      index += 1
    }

    if (x === '?' && y === '?') {
      status.untracked.push(filePath)
      continue
    }

    if (
      x === 'U' ||
      y === 'U' ||
      (x === 'D' && y === 'D') ||
      (x === 'A' && y === 'A')
    ) {
      status.conflicted.push({ path: filePath, status: 'conflicted', oldPath })
      continue
    }

    if (x !== ' ' && x !== '?') {
      status.staged.push({ path: filePath, status: mapStatusCode(x), oldPath })
    }
    if (y !== ' ' && y !== '?') {
      status.unstaged.push({ path: filePath, status: mapStatusCode(y), oldPath })
    }
  }

  return status
}

export async function stageFile(root: string, relativePath: string): Promise<void> {
  const result = await runGit(root, ['add', '--', relativePath])
  if (!result.ok) {
    throw new Error(result.stderr.trim() || 'git add failed.')
  }
}

export async function stageAllFiles(root: string): Promise<void> {
  const result = await runGit(root, ['add', '-A'])
  if (!result.ok) {
    throw new Error(result.stderr.trim() || 'git add -A failed.')
  }
}

export async function unstageFile(root: string, relativePath: string): Promise<void> {
  const modern = await runGit(root, ['restore', '--staged', '--', relativePath])
  if (modern.ok) return
  const legacy = await runGit(root, ['reset', 'HEAD', '--', relativePath])
  if (!legacy.ok) {
    throw new Error(legacy.stderr.trim() || 'git unstage failed.')
  }
}

export async function discardFile(root: string, relativePath: string): Promise<void> {
  // If the file is untracked, remove it from disk
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath)
  try {
    const isGitTracked = await runGit(root, ['ls-files', '--error-unmatch', '--', relativePath])
    if (!isGitTracked.ok) {
      await fs.unlink(absolutePath)
      return
    }
  } catch {
    // ignore
  }

  const modern = await runGit(root, ['restore', '--worktree', '--', relativePath])
  if (modern.ok) return
  const legacy = await runGit(root, ['checkout', '--', relativePath])
  if (!legacy.ok) {
    throw new Error(legacy.stderr.trim() || 'git discard failed.')
  }
}

export async function discardAllFiles(root: string): Promise<void> {
  const modern = await runGit(root, ['restore', '--worktree', '.'])
  if (modern.ok) return
  const legacy = await runGit(root, ['checkout', '--', '.'])
  if (!legacy.ok) {
    throw new Error(legacy.stderr.trim() || 'git discard all failed.')
  }
}

export async function commitChanges(
  root: string,
  message: string,
): Promise<GitCommitResult> {
  const trimmed = message.trim()
  if (trimmed === '') {
    throw new Error('Commit message is required.')
  }
  const result = await runGit(root, ['commit', '-m', trimmed])
  if (!result.ok) {
    throw new Error(result.stderr.trim() || 'git commit failed.')
  }

  const hashResult = await runGit(root, ['rev-parse', 'HEAD'])
  return {
    commitHash: hashResult.ok ? hashResult.stdout.trim() : '',
    summary: result.stdout.trim(),
  }
}

export async function getDiffContent(
  root: string,
  relativePath: string,
  staged: boolean,
): Promise<GitDiffContent> {
  const originalRef = staged ? `HEAD:${relativePath}` : `:${relativePath}`
  const originalResult = await runGit(root, ['show', originalRef])
  const original = originalResult.ok ? originalResult.stdout : ''

  let modified: string
  if (staged) {
    const indexResult = await runGit(root, ['show', `:${relativePath}`])
    modified = indexResult.ok ? indexResult.stdout : ''
  } else {
    try {
      modified = await fs.readFile(path.join(root, relativePath), 'utf8')
    } catch {
      modified = ''
    }
  }

  return {
    original,
    modified,
    exists: original !== '' || modified !== '',
  }
}
