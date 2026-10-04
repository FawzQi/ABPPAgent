import { describe, it, expect } from 'vitest'
import { expandQueryLocally, stemToken, splitCompound } from '../../src/main/services/agent/query-expander'
import { extractDeclarations, buildSkeleton } from '../../src/main/services/agent/codebase-map'

describe('Suggest Files & HyDE Components', () => {
  it('correctly stems English suffixes and splits compounds', () => {
    expect(stemToken('checking')).toBe('check')
    expect(stemToken('buttons')).toBe('button')
    expect(stemToken('crashed')).toBe('crash')
    expect(stemToken('faster')).toBe('fast')

    const compounds = splitCompound('user-auth_sessionController.tsx')
    expect(compounds).toContain('user')
    expect(compounds).toContain('auth')
    expect(compounds).toContain('session')
    expect(compounds).toContain('controller')
  })

  it('expands natural queries locally with domain synonyms and stems', () => {
    const expanded = expandQueryLocally('fix sluggish login button and auth token')
    expect(expanded.primaryTerms).toContain('sluggish')
    expect(expanded.primaryTerms).toContain('login')
    expect(expanded.primaryTerms).toContain('button')
    expect(expanded.primaryTerms).toContain('auth')
    expect(expanded.primaryTerms).toContain('token')

    // Check domain synonyms
    expect(expanded.allTerms).toContain('perf')
    expect(expanded.allTerms).toContain('latency')
    expect(expanded.allTerms).toContain('signin')
    expect(expanded.allTerms).toContain('btn')
  })

  it('builds token-efficient skeletons from TypeScript source code', () => {
    const tsCode = `
      import React, { useState } from 'react'
      import { formatToolResult } from './parser'

      export interface PersonProps {
        name: string
        role: string
      }

      export function PersonModal(props: PersonProps): JSX.Element {
        const [open, setOpen] = useState(false)
        return <div>{props.name}</div>
      }

      export const DEFAULT_PERSON = { name: 'Anonymous', role: 'Dev' }
    `

    const { deps, signatures } = extractDeclarations('PersonModal.tsx', tsCode)
    expect(deps).toContain('react')
    expect(deps).toContain('./parser')
    expect(signatures.some((s) => s.includes('interface PersonProps'))).toBe(true)
    expect(signatures.some((s) => s.includes('PersonModal'))).toBe(true)

    const skeleton = buildSkeleton('PersonModal.tsx', tsCode)
    expect(skeleton).toContain('File: PersonModal.tsx')
    expect(skeleton).toContain('Imports:')
    expect(skeleton).toContain('Declarations:')
  })
})
