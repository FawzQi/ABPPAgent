import type { AiProvider, CompleteInput } from './types'
import { describeFetchError, httpFetch } from './http'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const googleProvider: AiProvider = {
  id: 'google',
  label: 'Google AI Studio',
  keyUrl: 'https://aistudio.google.com/apikey',
  models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'],
  async listModels(apiKey: string): Promise<string[]> {
    const url = `${BASE}?key=${encodeURIComponent(apiKey)}`
    let response: Response
    try {
      response = await httpFetch(url)
    } catch (error) {
      throw new Error(describeFetchError('Google AI Studio', error))
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Google AI Studio model list returned ${response.status}: ${detail.slice(0, 200) || response.statusText}`)
    }
    const json = (await response.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
    }
    return (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter((name) => name !== '')
      .sort()
  },
  async complete(input: CompleteInput): Promise<string> {
    const model = input.model.replace(/^models\//, '')
    const url = `${BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: input.user }] }],
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? 2048,
        temperature: input.temperature ?? 0.2,
      },
    }

    if (input.system) {
      body.systemInstruction = { parts: [{ text: input.system }] }
    }

    let response: Response
    try {
      response = await httpFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (error) {
      throw new Error(describeFetchError('Google AI Studio', error))
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Google AI Studio returned ${response.status}: ${detail.slice(0, 300) || response.statusText}`)
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const parts = json.candidates?.[0]?.content?.parts ?? []
    return parts.map((p) => p.text ?? '').join('')
  },
}
