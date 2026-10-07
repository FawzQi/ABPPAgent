import type { WebChatTargetId } from '@shared/types'
import type { WebChatProfile } from './types'
import { deepseekProfile } from './deepseek'
import { chatgptProfile } from './chatgpt'
import { geminiProfile } from './gemini'
import { createFallbackProfile } from './fallback'

export * from './types'
export { deepseekProfile } from './deepseek'
export { chatgptProfile } from './chatgpt'
export { geminiProfile } from './gemini'

export const WEB_CHAT_PROFILES: Record<string, WebChatProfile> = {
  deepseek: deepseekProfile,
  chatgpt: chatgptProfile,
  gemini: geminiProfile,
}

export function getWebChatProfile(targetId: WebChatTargetId | string): WebChatProfile {
  if (WEB_CHAT_PROFILES[targetId]) {
    return WEB_CHAT_PROFILES[targetId]
  }
  return createFallbackProfile(targetId as WebChatTargetId, targetId, `https://${targetId}.com/`)
}
