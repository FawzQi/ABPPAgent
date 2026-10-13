import { describe, it, expect } from 'vitest'

describe('Web Chat Scraping & Copy Candidate Sorting', () => {
  it('correctly sorts DOM nodes in document order without timsort corruption', () => {
    // Simulate DOM elements with compareDocumentPosition
    const createMockNode = (order: number) => ({
      order,
      compareDocumentPosition(other: any) {
        if (this.order === other.order) return 0
        // Node.DOCUMENT_POSITION_PRECEDING = 2, Node.DOCUMENT_POSITION_FOLLOWING = 4
        return this.order < other.order ? 4 : 2
      },
    })

    const n1 = createMockNode(1)
    const n2 = createMockNode(2)
    const n3 = createMockNode(3)
    const n4 = createMockNode(4)

    const list = [n3, n1, n4, n2]

    list.sort((a, b) => {
      if (a === b) return 0
      const pos = a.compareDocumentPosition(b)
      if (pos & 4) return -1
      if (pos & 2) return 1
      return 0
    })

    expect(list.map((n) => n.order)).toEqual([1, 2, 3, 4])
  })

  it('validates candidate text against scraped baseline correctly', () => {
    const matchesScrapedBaseline = (candidateText: string, baseline?: string | null): boolean => {
      if (!baseline || baseline.trim().length === 0) return true
      if (!candidateText || candidateText.trim().length === 0) return false
      if (baseline.trim().length < 30) return true
      const normBase = baseline.replace(/[\s#*`_~>\-[\]()]/g, '').toLowerCase()
      const normCand = candidateText.replace(/[\s#*`_~>\-[\]()]/g, '').toLowerCase()
      if (normBase.length < 30 || normCand.length < 30) return true
      const startAnchor = normBase.slice(0, 30)
      const endAnchor = normBase.slice(-30)
      return (
        normCand.includes(startAnchor) ||
        normCand.includes(endAnchor) ||
        normBase.includes(normCand.slice(0, 30))
      )
    }

    const baseline = `Here is the solution to your issue:
We updated the database pool configuration and increased the maximum connections.
===Files===
src/config/db.ts`

    // Exact or formatted copy of the same turn
    const copiedMarkdown = `### Here is the solution to your issue:
We updated the database pool configuration and increased the maximum connections.

===Files===
\`src/config/db.ts\``

    expect(matchesScrapedBaseline(copiedMarkdown, baseline)).toBe(true)

    // Old turn about something completely different
    const oldTurn = `To run tests, use npm test or vitest run. Make sure your dependencies are installed with npm install.`
    expect(matchesScrapedBaseline(oldTurn, baseline)).toBe(false)

    // Unrelated code block
    const codeSnippet = `const a = 123;\nconst b = 456;\nconsole.log(a + b);`
    expect(matchesScrapedBaseline(codeSnippet, baseline)).toBe(false)
  })

  it('rejects copy-code buttons as code block controls', () => {
    const isCodeBlockControl = (el: { className: string; closest?: (s: string) => boolean }) => {
      if (!el) return true
      if (typeof el.className === 'string' && /copy-code|code-copy/i.test(el.className)) return true
      if (el.closest?.('pre, code, [class*="code-block" i]')) return true
      return false
    }

    expect(isCodeBlockControl({ className: 'copy-code-button' })).toBe(true)
    expect(isCodeBlockControl({ className: 'btn code-copy-action' })).toBe(true)
    expect(isCodeBlockControl({ className: 'response-copy-btn' })).toBe(false)
  })
})
