import { httpFetch, describeFetchError } from './ai-providers/http'

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const JEV_BATCH_SIZE = 20
const JEV_TIMEOUT_MS = 45_000

export interface JevCandidate {
  path: string
  skeleton: string
}

export interface JevScore {
  path: string
  score: number
  confidence: number
}

export interface JevScoreRequest {
  apiKey: string
  model: string
  instruction: string
  candidates: JevCandidate[]
}

export interface JevScoreResult {
  results: JevScore[]
  tokens: number
  batches: number
}

const SCORE_CRITERIA = [
  'unrelated to the instruction',
  'tangential mention only, unlikely to change',
  'probably involved in the change',
  'directly relevant, very likely to need changes',
]

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export async function scoreCandidatesWithJev(
  request: JevScoreRequest,
): Promise<JevScoreResult> {
  const { apiKey, model, instruction, candidates } = request
  if (candidates.length === 0) {
    return { results: [], tokens: 0, batches: 0 }
  }

  const batches = chunk(candidates, JEV_BATCH_SIZE)
  const results: JevScore[] = []
  let totalTokens = 0

  for (const batch of batches) {
    const state = { instruction }
    const questions: Record<string, unknown> = {}

    for (const candidate of batch) {
      questions[candidate.path] = {
        type: 'score',
        instructions: {
          file: {
            path: candidate.path,
            skeleton: candidate.skeleton,
          },
          question:
            'Rate how relevant this file is to the instruction. ' +
            'Use the criteria exactly as given.',
        },
        criteria: SCORE_CRITERIA,
      }
    }

    const body = { model, state, questions }

    let response: Response
    try {
      response = await httpFetch(
        JEV_ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        JEV_TIMEOUT_MS,
      )
    } catch (error) {
      throw new Error(describeFetchError('TypeSafe Jev', error))
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`TypeSafe Jev returned ${response.status}: ${detail.slice(0, 300) || response.statusText}`)
    }

    const json = (await response.json()) as {
      model?: string
      answers?: Record<string, { score?: number; confidence?: number }>
      usage?: { input_tokens?: number }
    }

    for (const [path, answer] of Object.entries(json.answers ?? {})) {
      const score = typeof answer.score === 'number' && Number.isFinite(answer.score) ? answer.score : 0
      const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) ? answer.confidence : 0
      results.push({ path, score, confidence })
    }

    const used = json.usage?.input_tokens
    if (typeof used === 'number' && Number.isFinite(used)) totalTokens += used
  }

  return { results, tokens: totalTokens, batches: batches.length }
}
