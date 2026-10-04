import { describe, it, expect } from 'vitest'
import {
  tokenize,
  expandQuery,
  Bm25Index,
  buildTreeLines,
  generateCodebaseContext,
  isCandidateCodeFile,
  parseGitLog,
} from '../../src/main/services/agent/codebase-context'
import path from 'node:path'

describe('codebase-context', () => {
  it('tokenizes identifiers and camelCase cleanly', () => {
    const tokens = tokenize('PersonModal.tsx getResearchInterests client/components')
    expect(tokens).toContain('person')
    expect(tokens).toContain('modal')
    expect(tokens).toContain('research')
    expect(tokens).toContain('interests')
  })

  it('expands query terms with domain synonyms', () => {
    const expanded = expandQuery('people research')
    expect(expanded).toContain('people')
    expect(expanded).toContain('person')
    expect(expanded).toContain('member')
    expect(expanded).toContain('research')
    expect(expanded).toContain('interest')
    expect(expanded).toContain('publication')
  })

  it('indexes documents and ranks them using BM25', () => {
    const docs = [
      { path: 'src/components/People.tsx', tokens: ['people', 'person', 'alumni', 'interest'] },
      { path: 'src/utils/math.ts', tokens: ['math', 'add', 'subtract', 'calculate'] },
      { path: 'src/components/Research.tsx', tokens: ['research', 'interest', 'publication'] },
    ]
    const index = new Bm25Index(docs)
    const hits = index.search(['research', 'interest'], 10)
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits[0].path).toBe('src/components/Research.tsx')
  })

  it('renders ASCII tree correctly', () => {
    const paths = ['src/components/Card.tsx', 'src/components/Header.tsx', 'src/index.ts']
    const tree = buildTreeLines(paths)
    expect(tree).toContain('src')
    expect(tree).toContain('components')
    expect(tree).toContain('Card.tsx')
    expect(tree).toContain('Header.tsx')
    expect(tree).toContain('index.ts')
  })

  it('filters out image, document, and binary files from candidates', () => {
    // Images
    expect(isCandidateCodeFile('logo.png')).toBe(false)
    expect(isCandidateCodeFile('assets/banner.jpg')).toBe(false)
    expect(isCandidateCodeFile('icon.svg')).toBe(false)
    expect(isCandidateCodeFile('favicon.ico')).toBe(false)
    expect(isCandidateCodeFile('screenshot.webp')).toBe(false)

    // Documents
    expect(isCandidateCodeFile('README.md')).toBe(false)
    expect(isCandidateCodeFile('docs/manual.pdf')).toBe(false)
    expect(isCandidateCodeFile('notes.txt')).toBe(false)
    expect(isCandidateCodeFile('data.csv')).toBe(false)
    expect(isCandidateCodeFile('report.docx')).toBe(false)

    // Binaries
    expect(isCandidateCodeFile('archive.zip')).toBe(false)
    expect(isCandidateCodeFile('binary.wasm')).toBe(false)
    expect(isCandidateCodeFile('package-lock.json')).toBe(true) // json is code/config

    // Valid code files
    expect(isCandidateCodeFile('src/main.ts')).toBe(true)
    expect(isCandidateCodeFile('src/App.tsx')).toBe(true)
    expect(isCandidateCodeFile('lib/utils.js')).toBe(true)
    expect(isCandidateCodeFile('server/api.py')).toBe(true)
    expect(isCandidateCodeFile('styles/theme.css')).toBe(true)
    expect(isCandidateCodeFile('Cargo.toml')).toBe(true)
  })

  it('parses git log with __C__%H commit headers correctly', () => {
    const rawGitLog = `__C__abc1234
src/main.ts
src/renderer.tsx

__C__def5678
src/utils.ts
`
    const commits = parseGitLog(rawGitLog)
    expect(commits.length).toBe(2)
    expect(commits[0].hash).toBe('abc1234')
    expect(commits[0].files).toEqual(['src/main.ts', 'src/renderer.tsx'])
    expect(commits[1].hash).toBe('def5678')
    expect(commits[1].files).toEqual(['src/utils.ts'])
  })

  it('generates codebase context for current workspace without throwing', async () => {
    const workspaceRoot = path.resolve('.')
    const context = await generateCodebaseContext(workspaceRoot, 'find agent orchestrator and parser')
    expect(context).toContain('# Codebase Context')
    expect(context).toContain('## Project Structure')
    expect(context).toContain('## Files')
    expect(context).toContain('orchestrator.ts')
    // Ensure no markdown or image files are in the suggested files list
    expect(context).not.toContain('File: README.md')
  })

  it('always generates suggested file blocks on subsequent calls without unchanged suppression', async () => {
    const workspaceRoot = path.resolve('.')
    const context1 = await generateCodebaseContext(workspaceRoot, 'find agent orchestrator and parser')
    const context2 = await generateCodebaseContext(workspaceRoot, 'find agent orchestrator and parser')
    expect(context1).toContain('## Files')
    expect(context2).toContain('## Files')
    // Verify no suppression
    expect(context2).not.toContain('(already in context, unchanged)')
  })
})
