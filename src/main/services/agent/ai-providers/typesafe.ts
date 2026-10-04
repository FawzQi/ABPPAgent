import type { AiProvider, CompleteInput } from './types'

export const typesafeProvider: AiProvider = {
  id: 'typesafe',
  label: 'TypeSafe (Jev)',
  keyUrl: 'https://typesafe.ai/console',
  models: ['jev-latest', 'jev-1.13.0'],
  async complete(_input: CompleteInput): Promise<string> {
    throw new Error(
      'TypeSafe is a typed-decision provider and does not answer chat completions directly. It is evaluated via the Jev pipeline.',
    )
  },
}
