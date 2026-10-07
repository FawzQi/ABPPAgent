import { describe, it, expect } from 'vitest'
import {
  getWebChatProfile,
  WEB_CHAT_PROFILES,
  deepseekProfile,
  chatgptProfile,
  geminiProfile,
} from '../../src/main/services/web-chat/profiles'
import { listWebChatTargets } from '../../src/main/services/web-chat/web-chat-service'

describe('Web Chat Provider Profiles', () => {
  it('registers all 3 core personalized profiles (deepseek, chatgpt, gemini)', () => {
    expect(WEB_CHAT_PROFILES.deepseek).toBeDefined()
    expect(WEB_CHAT_PROFILES.chatgpt).toBeDefined()
    expect(WEB_CHAT_PROFILES.gemini).toBeDefined()
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

  it('provides ChatGPT profile with ProseMirror injection, stop-button, and thought/citation stripping', () => {
    const profile = getWebChatProfile('chatgpt')
    expect(profile.id).toBe('chatgpt')
    expect(profile.url).toBe('https://chatgpt.com/')
    expect(profile.inputSelectors).toContain('#prompt-textarea')
    expect(profile.sendSelectors).toContain('button[data-testid="send-button"]')
    expect(profile.stopSelectors).toContain('button[data-testid="stop-button"]')
    expect(profile.copySelectors).toContain('button[data-testid="copy-turn-action-button"]')

    const injectScript = profile.getInjectPromptScript('testPrompt')
    expect(injectScript).toContain('ProseMirror')
    expect(injectScript).toContain('insertText')

    const isGenScript = profile.getIsGeneratingScript()
    expect(isGenScript).toContain('.result-streaming')

    const cleanScript = profile.getCleanResponseScript()
    expect(cleanScript).toContain('data-testid*="thought"')
    expect(cleanScript).toContain('data-citation')
  })

  it('provides Gemini profile with Quill / rich-textarea injection, mat-progress-spinner, and thought-container stripping', () => {
    const profile = getWebChatProfile('gemini')
    expect(profile.id).toBe('gemini')
    expect(profile.url).toBe('https://gemini.google.com/app')
    expect(profile.inputSelectors.some((s) => s.includes('.ql-editor'))).toBe(true)
    expect(profile.sendSelectors).toContain('button.send-button')
    expect(profile.responseSelectors).toContain('model-response')

    const injectScript = profile.getInjectPromptScript('testPrompt')
    expect(injectScript).toContain('rich-textarea')
    expect(injectScript).toContain('Quill')

    const isBusyScript = profile.getIsBusyScript()
    expect(isBusyScript).toContain('mat-progress-spinner')

    const cleanScript = profile.getCleanResponseScript()
    expect(cleanScript).toContain('thought-container')
  })

  it('falls back gracefully for unknown provider IDs', () => {
    const unknown = getWebChatProfile('custom_llm' as any)
    expect(unknown.id).toBe('custom_llm')
    expect(unknown.label).toBe('custom_llm')
    expect(unknown.inputSelectors.length).toBeGreaterThan(0)
    expect(unknown.getInjectPromptScript('p')).toBeDefined()
    expect(unknown.getSubmitScript()).toBeDefined()
  })

  it('includes exactly deepseek, chatgpt, and gemini in listWebChatTargets', () => {
    const targets = listWebChatTargets()
    const targetIds = targets.map((t) => t.id)
    expect(targetIds).toEqual(['deepseek', 'chatgpt', 'gemini'])
  })
})
