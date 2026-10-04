import type { AiProviderId, AiProviderInfo } from '@shared/types'
import { makeOpenAiCompatibleProvider } from './openai-compatible'
import { googleProvider } from './google'
import { typesafeProvider } from './typesafe'
import type { AiProvider } from './types'

const deepseek = makeOpenAiCompatibleProvider({
  id: 'deepseek',
  label: 'DeepSeek',
  keyUrl: 'https://platform.deepseek.com/api_keys',
  models: ['deepseek-flash', 'deepseek-chat', 'deepseek-reasoner'],
  baseUrl: 'https://api.deepseek.com/chat/completions',
})

const openai = makeOpenAiCompatibleProvider({
  id: 'openai',
  label: 'OpenAI',
  keyUrl: 'https://platform.openai.com/api-keys',
  models: ['gpt-4o-mini', 'gpt-4o'],
  baseUrl: 'https://api.openai.com/v1/chat/completions',
})

const groq = makeOpenAiCompatibleProvider({
  id: 'groq',
  label: 'Groq',
  keyUrl: 'https://console.groq.com/keys',
  models: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
  ],
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
})

const openrouter = makeOpenAiCompatibleProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  keyUrl: 'https://openrouter.ai/keys',
  models: [
    'z-ai/glm-5.2:free',
    'qwen/qwen3.8-27b:free',
    'inclusionai/ling-3.0-flash-vl:free',
  ],
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  extraHeaders: {
    'HTTP-Referer': 'https://github.com/ABPPAgent/ABPPAgent',
    'X-Title': 'ABPPAgent',
  },
})

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  deepseek,
  groq,
  openai,
  openrouter,
  google: googleProvider,
  typesafe: typesafeProvider,
}

export function getProvider(id: AiProviderId): AiProvider {
  const p = PROVIDERS[id]
  if (!p) throw new Error(`Unknown AI provider: ${id}`)
  return p
}

export function listProviders(): AiProviderInfo[] {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    keyUrl: p.keyUrl,
    models: p.models,
  }))
}

export async function discoverModels(
  id: AiProviderId,
  apiKey: string,
): Promise<string[]> {
  const provider = PROVIDERS[id]
  if (!provider) return []
  if (!provider.listModels) return [...provider.models]
  return provider.listModels(apiKey)
}
