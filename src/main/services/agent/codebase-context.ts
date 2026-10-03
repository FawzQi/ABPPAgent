import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

/**
 * Common English stopwords to discard during tokenization.
 */
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'let', 'me', 'more', 'most', 'my', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'out', 'over',
  'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'make', 'want', 'need', 'please', 'app', 'code',
])

/**
 * Curated domain synonyms mapping natural query terms to code symbols.
 */
const DOMAIN_SYNONYMS: Record<string, string[]> = {
  people: ['person', 'member', 'team', 'author', 'alumni', 'profile', 'staff', 'faculty'],
  research: ['interest', 'publication', 'paper', 'project', 'lab', 'study'],
  auth: ['login', 'signin', 'signout', 'session', 'token', 'user', 'credential'],
  login: ['auth', 'signin', 'session', 'token'],
  chat: ['message', 'conversation', 'prompt', 'webchat', 'stream'],
  tool: ['action', 'function', 'card', 'runner', 'command'],
  agent: ['orchestrator', 'session', 'loop', 'parser', 'prompt'],
  diff: ['patch', 'compare', 'change', 'hunk', 'viewer'],
  nav: ['navbar', 'header', 'sidebar', 'menu', 'tabs'],
  tab: ['tabs', 'switcher', 'navigation', 'panel'],
}

/**
 * Split text into lowercase tokens (splits camelCase, snake_case, kebab-case).
 */
export function tokenize(text: string): string[] {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))

  return words
}

/**
 * Expand query tokens with domain synonyms.
 */
export function expandQuery(text: string): string[] {
  const primary = tokenize(text)
  const expanded = new Set<string>(primary)

  for (const token of primary) {
    const synonyms = DOMAIN_SYNONYMS[token]
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn)
      }
    }
  }

  return [...expanded]
}

export interface Bm25Doc {
  path: string
  tokens: string[]
}

/**
 * Fast, pure-TypeScript BM25 index over file paths and contents.
 */
export class Bm25Index {
  private docs: { path: string; tokenCounts: Map<string, number>; length: number }[]
  private docFrequency: Map<string, number>
  private avgLength: number

  constructor(docs: Bm25Doc[]) {
    this.docFrequency = new Map()
    let totalLen = 0

    this.docs = docs.map((doc) => {
      const counts = new Map<string, number>()
      for (const t of doc.tokens) {
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
      for (const t of counts.keys()) {
        this.docFrequency.set(t, (this.docFrequency.get(t) ?? 0) + 1)
      }
      totalLen += doc.tokens.length
      return { path: doc.path, tokenCounts: counts, length: doc.tokens.length }
    })

    this.avgLength = docs.length > 0 ? totalLen / docs.length : 1
  }

  search(queryTokens: string[], limit: number = 20): { path: string; score: number }[] {
    const k1 = 1.5
    const b = 0.75
    const N = this.docs.length
    if (N === 0) return []

    const results: { path: string; score: number }[] = []

    for (const doc of this.docs) {
      let score = 0
      for (const token of queryTokens) {
        const tf = doc.tokenCounts.get(token) ?? 0
        if (tf === 0) continue

        const df = this.docFrequency.get(token) ?? 0
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
        const num = tf * (k1 + 1)
        const den = tf + k1 * (1 - b + b * (doc.length / this.avgLength))
        score += idf * (num / den)
      }

      if (score > 0) {
        results.push({ path: doc.path, score })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }
}

/**
 * Run a command and return stdout.
 */
function execProcess(cmd: string, args: string[], cwd: string, timeoutMs: number = 5000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve('')
    }, timeoutMs)

    child.stdout?.on('data', (d) => (out += String(d)))
    child.on('error', () => {
      clearTimeout(timer)
      resolve('')
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(out.trim())
    })
  })
}

/**
 * Get recent files from git log.
 */
export async function readGitRecentFiles(workspacePath: string, maxCommits: number = 30): Promise<string[]> {
  const stdout = await execProcess('git', ['log', `-n${maxCommits}`, '--name-only', '--pretty=format:'], workspacePath)
  if (!stdout) return []

  const files = stdout
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean)

  return [...new Set(files)]
}

/**
 * Run gitnexus query if available.
 */
export async function queryGitNexus(workspacePath: string, terms: string[]): Promise<string[]> {
  if (terms.length === 0) return []
  const stdout = await execProcess('gitnexus', ['query', terms.join(' ')], workspacePath, 6000)
  if (!stdout) return []

  const hits: string[] = []
  // Matches file paths in gitnexus output (e.g. src/foo.ts or JSON paths)
  const lines = stdout.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/(?:^|\s)([\w./\\-]+\.[a-zA-Z0-9]{1,6})(?::|\s|$)/)
    if (m && !hits.includes(m[1])) {
      hits.push(m[1].replace(/\\/g, '/'))
    }
  }

  return hits.slice(0, 15)
}

/**
 * List all workspace code files respecting git or excluding standard vendor directories.
 */
export async function getWorkspaceFiles(workspacePath: string): Promise<string[]> {
  const gitFiles = await execProcess('git', ['ls-files'], workspacePath)
  if (gitFiles) {
    return gitFiles
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, '/'))
      .filter((s) => s && !s.endsWith('.lock') && !s.endsWith('.png') && !s.endsWith('.jpg'))
  }

  // Fallback: fast recursive walk
  const results: string[] = []
  const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'out'])

  function walk(dir: string, relPrefix: string = '') {
    if (results.length > 500) return
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.env') continue
        if (IGNORE.has(e.name)) continue

        const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name
        if (e.isDirectory()) {
          walk(path.join(dir, e.name), rel)
        } else if (e.isFile()) {
          results.push(rel)
        }
      }
    } catch {}
  }

  walk(workspacePath)
  return results
}

/**
 * Render an ASCII tree from a list of file paths.
 */
export function buildTreeLines(filePaths: string[]): string {
  interface TreeNode {
    name: string
    children: Map<string, TreeNode>
  }
  const root: TreeNode = { name: '', children: new Map() }

  for (const filePath of [...filePaths].sort()) {
    const segments = filePath.split('/').filter(Boolean)
    let node = root
    for (const segment of segments) {
      let child = node.children.get(segment)
      if (!child) {
        child = { name: segment, children: new Map() }
        node.children.set(segment, child)
      }
      node = child
    }
  }

  const lines: string[] = []
  const render = (node: TreeNode, prefix: string): void => {
    const entries = [...node.children.values()]
    entries.forEach((child, index) => {
      const last = index === entries.length - 1
      lines.push(`${prefix}${last ? '└── ' : '├── '}${child.name}`)
      render(child, `${prefix}${last ? '    ' : '│   '}`)
    })
  }
  render(root, '')
  return lines.join('\n')
}

/**
 * Hybrid suggest-files engine combining GitNexus + BM25 + Git Recency + Query Expansion.
 */
export async function suggestRelevantFiles(
  workspacePath: string,
  instruction: string,
  maxFiles: number = 5
): Promise<string[]> {
  const allFiles = await getWorkspaceFiles(workspacePath)
  if (allFiles.length === 0) return []

  const queryTerms = expandQuery(instruction)
  if (queryTerms.length === 0) queryTerms.push(...tokenize(instruction))

  // Run GitNexus and Git log in parallel
  const [gitnexusHits, recentFiles] = await Promise.all([
    queryGitNexus(workspacePath, queryTerms),
    readGitRecentFiles(workspacePath),
  ])

  // Build shallow BM25 docs (path tokens + first 4KB content)
  const bm25Docs: Bm25Doc[] = []
  for (const relPath of allFiles.slice(0, 300)) {
    const pTokens = tokenize(relPath)
    let bodyTokens: string[] = []
    try {
      const fullPath = path.join(workspacePath, relPath)
      const stat = fs.statSync(fullPath)
      if (stat.isFile() && stat.size < 500_000) {
        const fd = fs.openSync(fullPath, 'r')
        const buf = Buffer.alloc(Math.min(stat.size, 4096))
        fs.readSync(fd, buf, 0, buf.length, 0)
        fs.closeSync(fd)
        bodyTokens = tokenize(buf.toString('utf8'))
      }
    } catch {}

    // Weight path tokens more heavily by duplicating
    bm25Docs.push({
      path: relPath,
      tokens: [...pTokens, ...pTokens, ...bodyTokens],
    })
  }

  const bm25Index = new Bm25Index(bm25Docs)
  const bm25Hits = bm25Index.search(queryTerms, 20)

  // Aggregate scores (reciprocal rank fusion)
  const scores = new Map<string, number>()
  const known = new Set(allFiles)

  gitnexusHits.forEach((hitPath, rank) => {
    if (known.has(hitPath)) {
      scores.set(hitPath, (scores.get(hitPath) ?? 0) + 3 / (rank + 5))
    }
  })

  bm25Hits.forEach((hit, rank) => {
    if (known.has(hit.path)) {
      scores.set(hit.path, (scores.get(hit.path) ?? 0) + 2 / (rank + 5))
    }
  })

  recentFiles.forEach((recPath, rank) => {
    if (known.has(recPath)) {
      scores.set(recPath, (scores.get(recPath) ?? 0) + 1.2 / (rank + 5))
    }
  })

  const sortedCandidates = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)

  return sortedCandidates.slice(0, maxFiles)
}

/**
 * Generate formatted <codebase_context> string containing tree and file previews.
 */
export async function generateCodebaseContext(workspacePath: string, instruction: string): Promise<string> {
  try {
    const suggestedFiles = await suggestRelevantFiles(workspacePath, instruction, 5)
    if (suggestedFiles.length === 0) return ''

    const tree = buildTreeLines(suggestedFiles)
    const filePreviews: string[] = []

    for (const relPath of suggestedFiles.slice(0, 4)) {
      try {
        const fullPath = path.join(workspacePath, relPath)
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8')
          const lines = content.split(/\r?\n/).slice(0, 40)
          filePreviews.push(`--- FILE: ${relPath} (first ${lines.length} lines) ---\n${lines.join('\n')}`)
        }
      } catch {}
    }

    return `<codebase_context>\nRELEVANT WORKSPACE FILES (Identified via GitNexus + BM25):\n${tree}\n\n${filePreviews.join('\n\n')}\n</codebase_context>`
  } catch (err: any) {
    return ''
  }
}
