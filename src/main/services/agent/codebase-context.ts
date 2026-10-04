import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { getFileSuggestionSettings, getApiKey } from './ai-settings'
import { expandQueryLocally, expandQueryWithAi } from './query-expander'
import { buildSkeleton, buildImportGraph } from './codebase-map'
import { scoreCandidatesWithJev } from './jev'
import { rankCandidatesWithLlm } from './llm-ranker'

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

const EXTENSION_LANGUAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.php': 'php',
  '.cs': 'csharp',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.sh': 'bash',
  '.sql': 'sql',
  '.xml': 'xml',
}

export function languageForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return EXTENSION_LANGUAGES[ext] ?? 'text'
}

export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

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

    this.avgLength = this.docs.length > 0 ? totalLen / this.docs.length : 1
  }

  search(queryTokens: string[], topK: number = 10): { path: string; score: number }[] {
    const N = this.docs.length
    if (N === 0) return []

    const k1 = 1.2
    const b = 0.75
    const scores = new Map<string, number>()

    for (const token of queryTokens) {
      const df = this.docFrequency.get(token) ?? 0
      if (df === 0) continue

      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)

      for (const doc of this.docs) {
        const tf = doc.tokenCounts.get(token) ?? 0
        if (tf === 0) continue

        const num = tf * (k1 + 1)
        const denom = tf + k1 * (1 - b + (b * doc.length) / this.avgLength)
        const termScore = idf * (num / denom)

        scores.set(doc.path, (scores.get(doc.path) ?? 0) + termScore)
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([path, score]) => ({ path, score }))
  }
}


export const EXCLUDED_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif', '.tiff', '.svg', '.svgz',
  // Documents & Data
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.rtf', '.csv', '.tsv', '.txt', '.md', '.markdown', '.rst', '.adoc',
  // Binaries & Archives
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bin', '.exe', '.dll', '.so', '.dylib', '.wasm', '.lock',
  // Media
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov', '.flv',
  // Fonts
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
])

export function isCandidateCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  if (!ext || EXCLUDED_EXTENSIONS.has(ext)) return false
  return true
}

export interface GitNexusHit {
  path: string
  score: number
  symbol?: string
}

export function queryGitNexus(
  workspacePath: string,
  queryTokens: string[],
  limit = 60,
): Promise<GitNexusHit[]> {
  const cleaned = queryTokens.map((t) => t.trim()).filter(Boolean)
  if (cleaned.length === 0) return Promise.resolve([])

  return new Promise((resolve) => {
    const child = spawn(
      'gitnexus',
      ['query', '--json', '--limit', String(limit), '--terms', cleaned.join(' ')],
      {
        cwd: workspacePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 4000,
        shell: process.platform === 'win32',
      },
    )

    let stdout = ''
    child.stdout?.on('data', (d) => {
      stdout += String(d)
    })
    child.on('error', () => resolve([]))
    child.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        return resolve([])
      }
      try {
        const parsed = JSON.parse(stdout)
        const rows: any[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.results)
            ? parsed.results
            : []
        const hits: GitNexusHit[] = []
        for (const row of rows) {
          if (row && typeof row.path === 'string') {
            hits.push({
              path: row.path.replace(/\\/g, '/'),
              score: typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : 1,
              symbol: typeof row.symbol === 'string' ? row.symbol : undefined,
            })
          }
        }
        if (hits.length > 0) return resolve(hits)
      } catch {}

      // Fallback text parsing if output was not JSON
      const paths: GitNexusHit[] = []
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed && (trimmed.includes('/') || trimmed.includes('.'))) {
          const match = trimmed.match(/(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/)
          if (match && match[1]) {
            paths.push({ path: match[1].replace(/\\/g, '/'), score: 1 })
          }
        }
      }
      resolve(paths)
    })
  })
}

const MAX_COMMITS = 40
const MAX_RECENT_FILES = 60
const CANDIDATE_LIMIT = 60
const JEV_INCLUDE_SCORE = 3
const JEV_REVIEW_SCORE = 2
const JEV_HIGH_CONFIDENCE = 0.85

export interface CommitInfo {
  hash: string
  files: string[]
}

export function runGitLog(root: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(
      'git',
      ['log', `-n${MAX_COMMITS}`, '--name-only', '--pretty=format:__C__%H'],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
    )
    let stdout = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.on('error', () => resolve(''))
    child.on('close', (code) => resolve(code === 0 ? stdout : ''))
  })
}

export function parseGitLog(stdout: string): CommitInfo[] {
  const commits: CommitInfo[] = []
  let current: CommitInfo | null = null
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    if (line.startsWith('__C__')) {
      current = { hash: line.slice(5), files: [] }
      commits.push(current)
      continue
    }
    if (current) current.files.push(line.replace(/\\/g, '/'))
  }
  return commits
}

export async function readRecentGitHistory(root: string): Promise<CommitInfo[]> {
  const stdout = await runGitLog(root)
  return stdout === '' ? [] : parseGitLog(stdout)
}

export async function readGitContext(
  root: string,
  known: Set<string>,
): Promise<{ history: CommitInfo[]; recentFiles: string[] }> {
  const history = await readRecentGitHistory(root)
  const recentFiles: string[] = []
  const seenRecent = new Set<string>()
  for (const commit of history) {
    for (const file of commit.files) {
      if (!known.has(file) || seenRecent.has(file) || !isCandidateCodeFile(file)) continue
      seenRecent.add(file)
      recentFiles.push(file)
      if (recentFiles.length >= MAX_RECENT_FILES) break
    }
    if (recentFiles.length >= MAX_RECENT_FILES) break
  }
  return { history, recentFiles }
}

export function readGitRecentFiles(workspacePath: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn('git', ['log', '-n30', '--name-only', '--pretty=format:'], {
      cwd: workspacePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 2000,
    })

    let stdout = ''
    child.stdout?.on('data', (d) => {
      stdout += String(d)
    })
    child.on('error', () => resolve([]))
    child.on('close', (code) => {
      if (code !== 0) return resolve([])
      const files: string[] = []
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed && isCandidateCodeFile(trimmed) && !files.includes(trimmed)) {
          files.push(trimmed)
        }
      }
      resolve(files.slice(0, 20))
    })
  })
}

export async function getWorkspaceFiles(dir: string, base: string = ''): Promise<string[]> {
  const results: string[] = []
  const IGNORED = new Set([
    'node_modules', '.git', 'out', 'dist', 'build', '.agent-data',
    '.vscode', '.idea', 'coverage', '.cache', 'AnythingButProPlan',
  ])

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      if (IGNORED.has(ent.name)) continue
      const relPath = base ? `${base}/${ent.name}` : ent.name
      if (ent.isDirectory()) {
        const subs = await getWorkspaceFiles(path.join(dir, ent.name), relPath)
        results.push(...subs)
      } else if (ent.isFile()) {
        if (isCandidateCodeFile(relPath)) {
          results.push(relPath)
        }
      }
    }
  } catch {}

  return results
}

interface TreeNode {
  name: string
  children: Map<string, TreeNode>
}

export function buildTreeLines(filePaths: string[]): string {
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

export async function suggestRelevantFiles(
  workspacePath: string,
  instruction: string,
  maxFiles: number = 5,
): Promise<string[]> {
  const allFiles = await getWorkspaceFiles(workspacePath)
  if (allFiles.length === 0) return []

  const settings = await getFileSuggestionSettings().catch(() => null)
  const method = settings?.method ?? 'gitnexus-bm25'

  let searchTokens: string[] = []

  // Stage 1: HyDE AI Expansion if enabled and in hyde mode
  if (method === 'hyde-gitnexus-bm25-jev' && settings?.enableHyde) {
    const hydeProv = settings.hydeProvider || 'deepseek'
    const hydeModel = settings.hydeModel || 'deepseek-flash'
    const hydeKey = await getApiKey(hydeProv)
    if (hydeKey) {
      try {
        const expanded = await expandQueryWithAi(instruction, hydeProv, hydeModel, hydeKey)
        searchTokens = expanded.allTerms
      } catch {}
    }
  }

  if (searchTokens.length === 0) {
    const localExpanded = expandQueryLocally(instruction)
    searchTokens = localExpanded.allTerms.length > 0 ? localExpanded.allTerms : tokenize(instruction)
  }

  const known = new Set(allFiles)

  // Stage 2: Local Recall (GitNexus + BM25 + Recency + Import Graph + Co-change)
  const [gitnexusHits, gitContext, importGraph] = await Promise.all([
    queryGitNexus(workspacePath, searchTokens, 60),
    readGitContext(workspacePath, known),
    buildImportGraph(workspacePath, allFiles).catch(() => new Map<string, Set<string>>()),
  ])
  const { history, recentFiles } = gitContext

  const bm25Docs: Bm25Doc[] = []
  for (const relPath of allFiles.slice(0, 350)) {
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

    bm25Docs.push({
      path: relPath,
      tokens: [...pTokens, ...pTokens, ...bodyTokens],
    })
  }

  const bm25Index = new Bm25Index(bm25Docs)
  const bm25Hits = bm25Index.search(searchTokens, 40)

  const scores = new Map<string, number>()
  const reasons = new Map<string, string[]>()

  const bump = (p: string, amount: number, reason: string): void => {
    if (!known.has(p) || !isCandidateCodeFile(p)) return
    scores.set(p, (scores.get(p) ?? 0) + amount)
    const list = reasons.get(p) ?? []
    if (!list.includes(reason)) list.push(reason)
    reasons.set(p, list)
  }

  // GitNexus reciprocal rank
  gitnexusHits
    .slice()
    .sort((a, b) => b.score - a.score)
    .forEach((hit, rank) => bump(hit.path, 3 / (rank + 5), 'gitnexus'))

  // BM25 reciprocal rank
  bm25Hits
    .slice()
    .sort((a, b) => b.score - a.score)
    .forEach((hit, rank) => bump(hit.path, 2 / (rank + 5), 'semantic'))

  // Git recency reciprocal rank
  recentFiles.forEach((p, rank) => {
    bump(p, 1.5 / (rank + 5), 'recent')
  })

  // Co-change and import-graph signals
  if (scores.size > 0) {
    const TOP_SEED_COUNT = 10
    const topSeeds = new Set(
      [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_SEED_COUNT)
        .map(([p]) => p),
    )

    // Import-graph 1-hop expansion and reinforcement
    if (importGraph && importGraph.size > 0) {
      for (const seed of topSeeds) {
        const neighbors = importGraph.get(seed)
        if (!neighbors) continue
        for (const neighbor of neighbors) {
          if (!known.has(neighbor) || !isCandidateCodeFile(neighbor)) continue
          if (scores.has(neighbor)) {
            bump(neighbor, 0.3, 'import-graph')
          } else {
            bump(neighbor, 0.4, 'import-graph')
          }
        }
      }
    }

    // In-set and out-of-set co-change pair scoring matching AnythingButProPlan
    const inSetCoChange = new Map<string, number>()
    const outOfSetCoChange = new Map<string, number>()
    for (const commit of history) {
      const inSet = commit.files.filter((file) => scores.has(file))
      if (inSet.length >= 2) {
        for (const file of inSet) {
          inSetCoChange.set(file, (inSetCoChange.get(file) ?? 0) + inSet.length - 1)
        }
      }
      const seedHits = commit.files.filter((file) => topSeeds.has(file))
      if (seedHits.length === 0) continue
      for (const file of commit.files) {
        if (!known.has(file) || !isCandidateCodeFile(file) || scores.has(file)) continue
        outOfSetCoChange.set(file, (outOfSetCoChange.get(file) ?? 0) + seedHits.length)
      }
    }
    for (const [p, count] of inSetCoChange) {
      bump(p, Math.min(count, 10) * 0.4, 'co-change')
    }
    for (const [p, count] of outOfSetCoChange) {
      if (count < 2) continue
      bump(p, Math.min(count, 6) * 0.3, 'co-change')
    }
  }

  const candidatePaths = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)
    .slice(0, CANDIDATE_LIMIT)

  // Stage 3: Jev precision scoring (when hyde-gitnexus-bm25-jev method is chosen)
  if (method === 'hyde-gitnexus-bm25-jev' && candidatePaths.length > 0) {
    const candidatesWithSkeleton = candidatePaths.map((p) => {
      try {
        const full = path.join(workspacePath, p)
        const content = fs.readFileSync(full, 'utf8')
        return { path: p, skeleton: buildSkeleton(p, content) }
      } catch {
        return { path: p, skeleton: `File: ${p}` }
      }
    })

    const typesafeKey = await getApiKey('typesafe')
    if (typesafeKey) {
      try {
        const model = 'jev-latest'
        const jevResult = await scoreCandidatesWithJev({
          apiKey: typesafeKey,
          model,
          instruction,
          candidates: candidatesWithSkeleton,
        })
        const included: string[] = []
        const flagged: string[] = []
        for (const r of jevResult.results) {
          if (r.score >= JEV_INCLUDE_SCORE && r.confidence >= JEV_HIGH_CONFIDENCE) {
            included.push(r.path)
          } else if (r.score >= JEV_REVIEW_SCORE) {
            flagged.push(r.path)
          }
        }
        const ordered = [...included, ...flagged]
        if (ordered.length > 0) {
          return ordered.slice(0, maxFiles)
        }
      } catch {}
    }
  }

  return candidatePaths.slice(0, maxFiles)
}

const FULL_FILE_MAX = 16_000
const FULL_CONTEXT_BUDGET = 24_000

/**
 * Generate formatted Markdown Codebase Context matching AnythingButProPlan layout:
 * # Codebase Context
 * ## Project Structure
 * ```
 * ├── ...
 * ```
 * ## Files
 * File: ...
 * ```lang
 * ...
 * ```
 */
export async function generateCodebaseContext(
  workspacePath: string,
  instruction: string,
): Promise<string> {
  try {
    const settings = await getFileSuggestionSettings().catch(() => null)
    if (settings && !settings.enabled) {
      return ''
    }

    const suggestedFiles = await suggestRelevantFiles(workspacePath, instruction, 5)
    if (suggestedFiles.length === 0) return ''

    const tree = buildTreeLines(suggestedFiles)
    const fileBlocks: string[] = []
    let budget = FULL_CONTEXT_BUDGET

    for (const relPath of suggestedFiles.slice(0, 4)) {
      try {
        const fullPath = path.join(workspacePath, relPath)
        if (!fs.existsSync(fullPath)) continue
        const lang = languageForPath(relPath)
        const content = fs.readFileSync(fullPath, 'utf8')
        const allLines = content.split(/\r?\n/)

        if (content.length <= FULL_FILE_MAX && content.length <= budget) {
          budget -= content.length
          fileBlocks.push(`File: ${relPath}\n\n\`\`\`${lang}\n${content}\n\`\`\``)
        } else {
          const lines = allLines.slice(0, 45)
          fileBlocks.push(
            `File: ${relPath} (preview lines 1-${lines.length} of ${allLines.length})\n\n\`\`\`${lang}\n${lines.join('\n')}\n\`\`\``,
          )
        }
      } catch {}
    }

    if (fileBlocks.length === 0) return ''

    return `# Codebase Context\n\n## Project Structure\n\n\`\`\`\n${tree}\n\`\`\`\n\n## Files\n\n${fileBlocks.join('\n\n')}`
  } catch {
    return ''
  }
}
