import type { AiProviderId } from '@shared/types'
import { getProvider } from './ai-providers'

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could',
  'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t',
  'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'her', 'here', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is',
  'isn\'t', 'it', 'its', 'itself', 'let', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t',
  'we', 'were', 'weren\'t', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'app', 'please', 'make', 'want', 'need', 'trying',
  'sure', 'actually', 'properly', 'code',
])

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  login: ['auth', 'signin', 'session', 'token', 'credential'],
  logout: ['signout', 'session', 'auth'],
  auth: ['login', 'signin', 'session', 'token', 'permission'],
  session: ['token', 'auth', 'cookie', 'state'],
  indicator: ['status', 'badge', 'state', 'dot', 'signal', 'pulse', 'spinner', 'working', 'idle', 'paused'],
  status: ['indicator', 'state', 'working', 'idle', 'paused', 'badge'],
  working: ['busy', 'generating', 'thinking', 'loading', 'active', 'progress'],
  paused: ['pause', 'continue', 'resume', 'interrupted'],
  idle: ['ready', 'inactive', 'standby'],
  spinner: ['loading', 'indicator', 'progress', 'spin'],
  button: ['btn', 'click', 'press', 'action', 'submit', 'trigger'],
  modal: ['dialog', 'popup', 'overlay', 'window'],
  dialog: ['modal', 'popup', 'alert', 'confirm'],
  page: ['view', 'screen', 'component', 'dashboard', 'panel'],
  dashboard: ['panel', 'view', 'prompt', 'board', 'home'],
  tree: ['hierarchy', 'node', 'filetree', 'folder'],
  tab: ['tabs', 'switcher', 'navigation', 'panel'],
  dark: ['theme', 'darkmode', 'light', 'color', 'mode'],
  theme: ['dark', 'light', 'mode', 'tailwind', 'color', 'style'],
  color: ['theme', 'style', 'css', 'class', 'bg'],
  slow: ['perf', 'performance', 'latency', 'speed', 'cache', 'debounce', 'throttle', 'optimize'],
  fast: ['speed', 'perf', 'performance', 'latency', 'cache', 'optimize'],
  sluggish: ['slow', 'perf', 'performance', 'latency', 'lag', 'speed', 'cache', 'optimize'],
  lag: ['latency', 'slow', 'delay', 'perf', 'performance'],
  speed: ['perf', 'performance', 'fast', 'latency', 'cache'],
  perf: ['performance', 'speed', 'latency', 'cache', 'benchmark'],
  ai: ['llm', 'model', 'provider', 'prompt', 'completion', 'chat', 'webchat'],
  llm: ['ai', 'model', 'provider', 'chat', 'deepseek', 'groq', 'openai'],
  chat: ['webchat', 'conversation', 'prompt', 'message', 'reply', 'response'],
  webchat: ['chat', 'window', 'deepseek', 'chatgpt', 'browser', 'target'],
  prompt: ['instruction', 'template', 'builder', 'query', 'input'],
  file: ['path', 'fs', 'document', 'entry', 'tree'],
  folder: ['dir', 'directory', 'path', 'folder'],
  git: ['vcs', 'commit', 'diff', 'branch', 'log', 'history'],
  diff: ['patch', 'change', 'viewer', 'compare', 'hunk'],
  test: ['spec', 'unit', 'e2e', 'vitest', 'playwright', 'assert'],
  error: ['fail', 'failure', 'exception', 'catch', 'reject', 'warn'],
  bug: ['issue', 'fix', 'error', 'defect', 'problem'],
  upload: ['import', 'scanner', 'attach', 'file', 'converter'],
  people: ['person', 'member', 'team', 'author', 'alumni', 'profile', 'staff', 'faculty'],
  research: ['interest', 'publication', 'paper', 'project', 'lab', 'study'],
}

export function stemToken(word: string): string {
  let s = word.toLowerCase()
  if (s.length <= 3) return s

  if (s.endsWith('sses')) return s.slice(0, -2)
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y'
  if (s.endsWith('ss')) return s
  if (s.endsWith('s') && !s.endsWith('us') && !s.endsWith('is')) return s.slice(0, -1)

  if (s.endsWith('eed') && s.length > 4) return s.slice(0, -1)
  if (s.endsWith('ed') && s.length > 4) {
    s = s.slice(0, -2)
    if (s.endsWith('at') || s.endsWith('bl') || s.endsWith('iz')) return s + 'e'
    return s
  }

  if (s.endsWith('ing') && s.length > 5) {
    const base = s.slice(0, -3)
    if (base.endsWith('at') || base.endsWith('bl') || base.endsWith('iz')) return base + 'e'
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      return base.slice(0, -1)
    }
    return base
  }

  if (s.endsWith('er') && s.length > 4) {
    return s.slice(0, -2)
  }

  return s
}

export function splitCompound(token: string): string[] {
  const parts: string[] = []
  const subTokens = token.split(/[-_/.\\]+/)
  for (const sub of subTokens) {
    const camelParts = sub.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/)
    for (const cp of camelParts) {
      const clean = cp.toLowerCase().trim()
      if (clean.length > 0) parts.push(clean)
    }
  }
  return parts
}

export interface ExpandedQuery {
  primaryTerms: string[]
  expandedTerms: string[]
  allTerms: string[]
}

export function expandQueryLocally(instruction: string): ExpandedQuery {
  const primarySet = new Set<string>()
  const expandedSet = new Set<string>()

  const rawPieces = instruction
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2)

  for (const piece of rawPieces) {
    if (STOPWORDS.has(piece)) continue
    primarySet.add(piece)

    const stem = stemToken(piece)
    if (stem !== piece && stem.length >= 2) {
      expandedSet.add(stem)
    }

    const synonyms = DOMAIN_SYNONYMS[piece] ?? DOMAIN_SYNONYMS[stem]
    if (Array.isArray(synonyms)) {
      for (const syn of synonyms) {
        expandedSet.add(syn)
      }
    }
  }

  if (primarySet.size === 0) {
    for (const piece of rawPieces) {
      primarySet.add(piece)
    }
  }

  const primaryTerms = [...primarySet]
  const expandedTerms = [...expandedSet].filter((t) => !primarySet.has(t))
  const allTerms = [...primaryTerms, ...expandedTerms]

  return { primaryTerms, expandedTerms, allTerms }
}

export async function expandQueryWithAi(
  instruction: string,
  providerId: AiProviderId,
  model: string,
  apiKey: string,
): Promise<ExpandedQuery> {
  const local = expandQueryLocally(instruction)
  if (!apiKey || instruction.trim().length === 0) {
    return local
  }

  try {
    const provider = getProvider(providerId)
    const prompt =
      'You are a code search assistant. Given the following user instruction, ' +
      'list 8 to 12 concise code identifiers, function names, component names, ' +
      'and technical file concepts a developer would search for in the codebase to solve this.\n\n' +
      `User Instruction: "${instruction}"\n\n` +
      'Output ONLY a comma-separated list of keywords/identifiers, with no commentary or prose.'

    const responseText = await provider.complete({
      apiKey,
      model,
      system: 'You are a code search assistant that outputs comma-separated identifiers.',
      user: prompt,
      maxTokens: 120,
      temperature: 0.1,
    })

    const combinedSet = new Set(local.allTerms)
    const aiKeywords: string[] = []

    const cleanTokens = responseText
      .replace(/[^\w\s,-]/g, '')
      .split(/[,\n]+/)
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length >= 2 && k.length <= 40)

    for (const kw of cleanTokens) {
      for (const part of splitCompound(kw)) {
        if (!STOPWORDS.has(part) && !combinedSet.has(part)) {
          combinedSet.add(part)
          aiKeywords.push(part)
        }
      }
    }

    return {
      primaryTerms: local.primaryTerms,
      expandedTerms: [...local.expandedTerms, ...aiKeywords],
      allTerms: [...combinedSet],
    }
  } catch {
    return local
  }
}
