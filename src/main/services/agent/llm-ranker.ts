import type { AiProviderId } from '@shared/types'
import { getProvider } from './ai-providers'

export interface LlmCandidate {
  path: string
  skeleton: string
}

export interface LlmVerdict {
  path: string
  score: number
  confidence: number
  reason?: string
}

export interface LlmRankRequest {
  apiKey: string
  provider: AiProviderId
  model: string
  instruction: string
  candidates: LlmCandidate[]
}

export interface LlmRankResult {
  verdicts: LlmVerdict[]
}

const MAX_CANDIDATES_PER_CALL = 30

const SYSTEM_PROMPT = [
  'You rate how relevant each file in a repository is to a code-change request.',
  '',
  'For every file you are shown, output a rating on this exact scale:',
  '  0 = unrelated to the instruction',
  '  1 = tangential mention only, unlikely to need changes',
  '  2 = probably involved in the change',
  '  3 = directly relevant, very likely to need changes',
  '',
  'Also output a confidence between 0 and 1 for your rating, and a short',
  'reason of at most 15 words.',
  '',
  'Reply with ONLY a JSON object of the form:',
  '{"files":[{"path":"<path>","score":<0-3>,"confidence":<0-1>,"reason":"<why>"}]}',
].join('\n')

function buildUserMessage(
  instruction: string,
  candidates: LlmCandidate[],
): string {
  const blocks = candidates
    .map(
      (candidate, index) =>
        `### File ${index + 1}: ${candidate.path}\n\`\`\`\n${candidate.skeleton}\n\`\`\``,
    )
    .join('\n\n')
  return [
    `Change request:\n${instruction}`,
    '',
    `Rate the relevance of each of the ${candidates.length} file(s) below:`,
    '',
    blocks,
  ].join('\n')
}

function coerceScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(3, Math.round(num)))
}

function coerceConfidence(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(1, num))
}

function parseVerdicts(raw: string, known: Set<string>): LlmVerdict[] {
  let cleaned = raw.trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  let parsed: any = null
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return []
  }

  const list = Array.isArray(parsed?.files) ? parsed.files : Array.isArray(parsed?.results) ? parsed.results : []
  const verdicts: LlmVerdict[] = []
  const seen = new Set<string>()

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const p = typeof item.path === 'string' ? item.path : null
    if (!p || !known.has(p) || seen.has(p)) continue
    seen.add(p)
    verdicts.push({
      path: p,
      score: coerceScore(item.score),
      confidence: coerceConfidence(item.confidence),
      reason: typeof item.reason === 'string' ? item.reason.trim() : undefined,
    })
  }

  return verdicts
}

export async function rankCandidatesWithLlm(
  request: LlmRankRequest,
): Promise<LlmRankResult> {
  const { apiKey, provider, model, instruction, candidates } = request
  if (candidates.length === 0) {
    return { verdicts: [] }
  }

  const providerImpl = getProvider(provider)
  const known = new Set(candidates.map((c) => c.path))
  const verdicts: LlmVerdict[] = []

  for (let i = 0; i < candidates.length; i += MAX_CANDIDATES_PER_CALL) {
    const batch = candidates.slice(i, i + MAX_CANDIDATES_PER_CALL)
    const prompt = buildUserMessage(instruction, batch)
    try {
      const response = await providerImpl.complete({
        apiKey,
        model,
        system: SYSTEM_PROMPT,
        user: prompt,
        maxTokens: 1500,
        temperature: 0.1,
      })
      verdicts.push(...parseVerdicts(response, known))
    } catch {
      // If LLM rating fails for batch, fall back to default
    }
  }

  return { verdicts }
}
