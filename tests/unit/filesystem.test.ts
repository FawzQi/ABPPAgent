import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { FilesystemTools } from '../../src/main/services/tools/filesystem'

describe('FilesystemTools', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abpp-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads file with line numbers', () => {
    const filePath = path.join(tmpDir, 'test.txt')
    fs.writeFileSync(filePath, 'line one\nline two\nline three')

    const res = FilesystemTools.readFile('call_1', filePath, 1, 2)
    expect(res.isError).toBe(false)
    expect(res.output).toBe('1: line one\n2: line two')
  })

  it('computes diff additions and deletions', () => {
    const diff = FilesystemTools.computeDiff('file.ts', 'const a = 1;\nreturn a;', 'const a = 2;\nconst b = 3;\nreturn a + b;')
    expect(diff.additions).toBeGreaterThan(0)
    expect(diff.deletions).toBeGreaterThan(0)
    expect(diff.filePath).toBe('file.ts')
  })

  it('writes file and creates parent directories', () => {
    const nested = path.join(tmpDir, 'sub', 'folder', 'output.txt')
    const res = FilesystemTools.writeFile('call_w', nested, 'hello world', true)
    expect(res.isError).toBe(false)
    expect(fs.existsSync(nested)).toBe(true)
    expect(fs.readFileSync(nested, 'utf-8')).toBe('hello world')
  })

  it('replaces file content surgically', () => {
    const filePath = path.join(tmpDir, 'code.ts')
    fs.writeFileSync(filePath, 'function run() {\n  return false;\n}')

    const res = FilesystemTools.replaceFileContent('call_r', filePath, 'return false;', 'return true;')
    expect(res.isError).toBe(false)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('function run() {\n  return true;\n}')
  })

  it('rejects catastrophic truncation writes to protect existing files', () => {
    const filePath = path.join(tmpDir, 'Component.tsx')
    // Create an existing file of ~1000 bytes
    const largeOriginalCode = 'export function Component() {\n' + '  const x = 1;\n'.repeat(50) + '  return <div>OK</div>;\n}'
    fs.writeFileSync(filePath, largeOriginalCode)
    expect(fs.readFileSync(filePath, 'utf-8').length).toBeGreaterThan(500)

    // Attempt to overwrite with 25-byte fragment (like the failure trace)
    const res = FilesystemTools.writeFile('call_bad', filePath, 'import { useState } from ', true)
    expect(res.isError).toBe(true)
    expect(res.output).toContain('Safety Guardrail: Overwrite rejected!')

    // Verify existing file is completely intact!
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(largeOriginalCode)
  })

  it('saves and restores shadow backups on valid overwrites', () => {
    const filePath = path.join(tmpDir, 'BackedUp.tsx')
    fs.writeFileSync(filePath, 'original version content that is important')

    // Valid overwrite
    FilesystemTools.writeFile('call_ok', filePath, 'new updated content that is also substantial', true)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new updated content that is also substantial')

    // Shadow backup should hold the old version
    const backup = FilesystemTools.getShadowBackup(filePath)
    expect(backup).toBe('original version content that is important')

    // Restore shadow backup
    const restored = FilesystemTools.restoreShadowBackup(filePath)
    expect(restored).toBe(true)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original version content that is important')
  })
})
