import type { AiProviderId } from '@shared/types'
import type { AiProvider, CompleteInput } from './types'
import { describeFetchError, httpFetch } from './http'

interface OpenAiCompatibleOptions {
  id: AiProviderId
  label: string
  keyUrl: string
  models: string[]
  baseUrl: string
  extraHeaders?: Record<string, string>
}

export function makeOpenAiCompatibleProvider(
  options: OpenAiCompatibleOptions,
): AiProvider {
  return {
    id: options.id,
    label: options.label,
    keyUrl: options.keyUrl,
    models: options.models,
    async complete(input: CompleteInput): Promise<string> {
      const body = {
        model: input.model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens ?? 2048,
        temperature: input.temperature ?? 0.2,
      }

      let response: Response
      try {
        response = await httpFetch(options.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
            ...(options.extraHeaders ?? {}),
          },
          body: JSON.stringify(body),
        })
      } catch (error) {
        throw new Error(describeFetchError(options.label, error))
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`${options.label} returned ${response.status}: ${detail.slice(0, 300) || response.statusText}`)
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      return json.choices?.[0]?.message?.content ?? ''
    },
  }
}
