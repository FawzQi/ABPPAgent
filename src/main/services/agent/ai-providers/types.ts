import type { AiProviderId } from '@shared/types'

export interface CompleteInput {
  apiKey: string
  model: string
  system: string
  user: string
  maxTokens?: number
  temperature?: number
}

export interface AiProvider {
  id: AiProviderId
  label: string
  keyUrl: string
  models: string[]
  complete(input: CompleteInput): Promise<string>
}
