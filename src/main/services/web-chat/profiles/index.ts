import type { WebChatTargetId } from '@shared/types'
import type { WebChatProfile } from './types'
import { deepseekProfile } from './deepseek'
import { qwenProfile } from './qwen'
import { glmProfile } from './glm'
import { createFallbackProfile } from './fallback'

export * from './types'
export { deepseekProfile } from './deepseek'
export { qwenProfile } from './qwen'
export { glmProfile } from './glm'

export const WEB_CHAT_PROFILES: Record<string, WebChatProfile> = {
  deepseek: deepseekProfile,
  qwen: qwenProfile,
  glm: glmProfile,
}

export function getWebChatProfile(targetId: WebChatTargetId | string): WebChatProfile {
  if (WEB_CHAT_PROFILES[targetId]) {
    return WEB_CHAT_PROFILES[targetId]
  }
  return createFallbackProfile(targetId as WebChatTargetId, targetId, `https://${targetId}.com/`)
}
