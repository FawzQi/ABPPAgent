import { describe, it, expect } from 'vitest'
import {
  getWebChatProfile,
  WEB_CHAT_PROFILES,
  deepseekProfile,
  qwenProfile,
  glmProfile,
} from '../../src/main/services/web-chat/profiles'
import { listWebChatTargets } from '../../src/main/services/web-chat/web-chat-service'

describe('Web Chat Provider Profiles', () => {
  it('registers all 3 core personalized profiles (deepseek, qwen, glm)', () => {
    expect(WEB_CHAT_PROFILES.deepseek).toBeDefined()
    expect((WEB_CHAT_PROFILES as any).chatgpt).toBeUndefined()
    expect(WEB_CHAT_PROFILES.qwen).toBeDefined()
    expect(WEB_CHAT_PROFILES.glm).toBeDefined()
    expect((WEB_CHAT_PROFILES as any).kimi).toBeUndefined()
    expect((WEB_CHAT_PROFILES as any).gemini).toBeUndefined()
  })

  it('provides DeepSeek profile with textarea injection and SVG rect detection', () => {
    const profile = getWebChatProfile('deepseek')
    expect(profile.id).toBe('deepseek')
    expect(profile.url).toBe('https://chat.deepseek.com/')
    expect(profile.inputSelectors).toContain('textarea#chat-input')
    expect(profile.sendSelectors).toContain('div[role="button"][aria-disabled="false"][class*="send"]')

    const injectScript = profile.getInjectPromptScript('testPrompt')
    expect(injectScript).toContain('HTMLTextAreaElement.prototype')

    const isGenScript = profile.getIsGeneratingScript()
    expect(isGenScript).toContain('svg rect')

    const isPausedScript = profile.getIsPausedScript()
    expect(isPausedScript).toContain('继续生成')

    const cleanScript = profile.getCleanResponseScript()
    expect(cleanScript).toContain('.ds-thought')
  })


  it('provides Qwen profile with textarea injection, send/stop selectors, and thought stripping', () => {
    const profile = getWebChatProfile('qwen')
    expect(profile.id).toBe('qwen')
    expect(profile.url).toBe('https://chat.qwen.ai/')
    expect(profile.inputSelectors).toContain('textarea.message-input-textarea')
    expect(profile.sendSelectors).toContain('button.send-button:not(.disabled)')
    expect(profile.stopSelectors).toContain('button.stop-button')
    expect(profile.stopSelectors).toContain('button[aria-label*="停止" i]')
    expect(profile.copySelectors).toContain('button.copy-response-button')
    expect(profile.responseSelectors[0]).toContain('.chat-response-message')

    const injectScript = profile.getInjectPromptScript('testPrompt')
    expect(injectScript).toContain('HTMLTextAreaElement.prototype')

    const isBusyScript = profile.getIsBusyScript()
    expect(isBusyScript).toContain('qwen-chat-thinking-status-card-loading')

    const cleanScript = profile.getCleanResponseScript()
    expect(cleanScript).toContain('qwen-chat-thinking-status-card-content')
  })

  it('provides GLM profile with textarea#chat-input and sendMessageButton', () => {
    const profile = getWebChatProfile('glm')
    expect(profile.id).toBe('glm')
    expect(profile.url).toBe('https://chat.z.ai/')
    expect(profile.inputSelectors).toContain('textarea#chat-input')
    expect(profile.sendSelectors).toContain('button.sendMessageButton:not(:disabled)')
    expect(profile.sendSelectors).toContain('#send-message-button')
    expect(profile.responseSelectors).toContain('div.chat-assistant')
    expect(profile.responseSelectors).toContain('div.markdown-prose')
    expect(profile.responseSelectors).toContain('div.markdown')
    expect(profile.responseSelectors[0]).toContain('[data-message-role="assistant"]')
    expect(profile.copySelectors).not.toContain('button.copy-code-button')
    expect(profile.copySelectors).toContain('button[aria-label="Copy"]')

    const injectScript = profile.getInjectPromptScript('testPrompt')
    expect(injectScript).toContain('HTMLTextAreaElement.prototype')

    const submitScript = profile.getSubmitScript()
    expect(submitScript).toContain('PointerEvent')

    const isBusyScript = profile.getIsBusyScript()
    expect(isBusyScript).toContain('thinking-chain-container')

    const cleanScript = profile.getCleanResponseScript()
    expect(cleanScript).toContain('thinking-chain-container')
  })

  it('falls back gracefully for unknown provider IDs', () => {
    const unknown = getWebChatProfile('custom_llm' as any)
    expect(unknown.id).toBe('custom_llm')
    expect(unknown.label).toBe('custom_llm')
    expect(unknown.inputSelectors.length).toBeGreaterThan(0)
    expect(unknown.getInjectPromptScript('p')).toContain('DataTransfer')
    expect(unknown.getSubmitScript()).toContain('PointerEvent')
  })

  it('ensures all profile script snippets are valid JavaScript', () => {
    const targets = [deepseekProfile, qwenProfile, glmProfile]
    for (const p of targets) {
      expect(() => new Function('promptVal', 'input', 'queryFirst', 'inputSels', 'sleep', `return (async () => { ${p.getInjectPromptScript('promptVal')} })()`)).not.toThrow()
      expect(() => new Function('input', 'queryFirst', 'sendSels', 'inputSels', 'sleep', `return (async () => { ${p.getSubmitScript()} })()`)).not.toThrow()
      expect(() => new Function('stopSels', p.getIsGeneratingScript())).not.toThrow()
      expect(() => new Function(p.getIsPausedScript())).not.toThrow()
      expect(() => new Function(p.getIsBusyScript())).not.toThrow()
      expect(() => new Function('clone', p.getCleanResponseScript())).not.toThrow()
    }
  })

})
