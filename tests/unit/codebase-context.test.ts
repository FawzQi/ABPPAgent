import { describe, it, expect } from 'vitest'
import {
  tokenize,
  expandQuery,
  Bm25Index,
  buildTreeLines,
  generateCodebaseContext,
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

  it('generates codebase context for current workspace without throwing', async () => {
    const workspaceRoot = path.resolve('.')
    const context = await generateCodebaseContext(workspaceRoot, 'find agent orchestrator and parser')
    expect(context).toContain('# Relevant Workspace Files (Codebase Context)')
    expect(context).toContain('## Workspace File Tree')
    expect(context).toContain('orchestrator.ts')
  })
})
