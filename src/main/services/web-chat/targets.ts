import type { WebChatTargetId } from '@shared/types'

export interface WebChatTargetConfig {
  id: WebChatTargetId
  label: string
  url: string
  inputSelectors: string[]
  sendSelectors: string[]
  responseSelectors: string[]
  stopSelectors: string[]
  copySelectors?: string[]
}

export const WEB_CHAT_TARGETS: WebChatTargetConfig[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek (V3/R1)',
    url: 'https://chat.deepseek.com/',
    inputSelectors: [
      'textarea#chat-input',
      'textarea[placeholder]',
      'div[contenteditable="true"]',
    ],
    sendSelectors: [
      'div[role="button"][aria-disabled="false"][class*="send"]',
      'div[role="button"][class*="send"]',
    ],
    responseSelectors: ['.ds-markdown', 'div[class*="markdown"]'],
    stopSelectors: [
      'div[role="button"][aria-label*="Stop" i]',
      'button[aria-label*="Stop" i]',
      '.ds-icon-button[aria-label*="Stop" i]',
    ],
    copySelectors: [
      'div[role="button"][aria-label*="Copy" i]',
      'button[aria-label*="Copy" i]',
      'div[role="button"][title*="Copy" i]',
      '.ds-icon-button[aria-label*="Copy" i]',
      '.ds-icon-button[title*="Copy" i]',
      '[data-testid*="copy" i]',
      'button[class*="copy" i]',
      'div[role="button"][class*="copy" i]',
    ],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT (GPT-4o/o1)',
    url: 'https://chatgpt.com/',
    inputSelectors: [
      '#prompt-textarea',
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"]',
    ],
    sendSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
    ],
    stopSelectors: [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop" i]',
    ],
    copySelectors: [
      'button[data-testid="copy-turn-action-button"]',
      'button[aria-label="Copy"]',
      'button[aria-label*="Copy" i]',
    ],
  },
  {
    id: 'claude',
    label: 'Claude (3.7 Sonnet)',
    url: 'https://claude.ai/new',
    inputSelectors: [
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"]',
    ],
    sendSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label*="Send" i]',
    ],
    responseSelectors: [
      '.font-claude-message',
      '[data-testid="assistant-message"]',
    ],
    stopSelectors: [
      'button[aria-label="Stop response"]',
      'button[aria-label*="Stop" i]',
    ],
    copySelectors: [
      'button[data-testid="action-bar-copy"]',
      'button[aria-label*="Copy" i]',
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini (Advanced/Flash)',
    url: 'https://gemini.google.com/app',
    inputSelectors: [
      'rich-textarea .ql-editor[contenteditable="true"]',
      'div[contenteditable="true"].ql-editor',
      'div[contenteditable="true"]',
    ],
    sendSelectors: ['button.send-button', 'button[aria-label*="Send" i]'],
    responseSelectors: [
      'model-response',
      '.model-response-text',
      'message-content',
    ],
    stopSelectors: ['button[aria-label*="Stop" i]'],
    copySelectors: ['copy-button button', 'button[aria-label*="Copy" i]'],
  },
]
