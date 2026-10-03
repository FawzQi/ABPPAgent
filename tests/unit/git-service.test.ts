import { describe, it, expect } from 'vitest'
import path from 'node:path'
import * as GitService from '../../src/main/services/git/git-service'

describe('GitService', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  it('detects a valid git repository', async () => {
    const isRepo = await GitService.isRepository(repoRoot)
    expect(isRepo).toBe(true)
  })

  it('fetches git status with branch and change lists', async () => {
    const status = await GitService.getStatus(repoRoot)
    expect(status).not.toBeNull()
    if (status) {
      expect(typeof status.ahead).toBe('number')
      expect(typeof status.behind).toBe('number')
      expect(Array.isArray(status.staged)).toBe(true)
      expect(Array.isArray(status.unstaged)).toBe(true)
      expect(Array.isArray(status.untracked)).toBe(true)
    }
  })

  it('fetches diff content for tracked files', async () => {
    const diff = await GitService.getDiffContent(repoRoot, 'package.json', false)
    expect(diff).toHaveProperty('original')
    expect(diff).toHaveProperty('modified')
    expect(diff.exists).toBe(true)
  })
})
