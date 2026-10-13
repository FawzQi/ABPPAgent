import type { WebChatProfile } from './types'

export const qwenProfile: WebChatProfile = {
  id: 'qwen',
  label: 'Qwen',
  url: 'https://chat.qwen.ai/',
  inputSelectors: [
    'textarea.message-input-textarea',
    'textarea[placeholder*="Qwen" i]',
    'textarea',
  ],
  sendSelectors: [
    'button.send-button:not(.disabled)',
    'button.send-button',
    'button[aria-label="Send"]',
    'button[aria-label*="Send" i]',
  ],
  responseSelectors: [
    '.chat-response-message .custom-qwen-markdown',
    '.chat-response-message .qwen-markdown',
    '.chat-response-message .response-message-content',
    'div.chat-response-message',
    '.chat-response-message',
  ],
  stopSelectors: [
    'button.stop-button',
    'button[aria-label="Stop"]',
    'button[aria-label*="Stop" i]',
    'button[aria-label*="停止" i]',
    'button[title*="Stop" i]',
    'button[title*="停止" i]',
  ],
  copySelectors: [
    '.response-message-footer button[aria-label*="Copy" i]',
    'button.qwen-chat-package-comp-new-action-control-container-copy',
    '.chat-response-message button[aria-label*="Copy" i]',
    'button.copy-response-button',
    'button[aria-label="Copy"]',
    'button[aria-label*="Copy" i]',
  ],
  fileSelectors: ['input[type="file"]'],

  getInjectPromptScript: (promptVarName: string) => `
    input.focus();
    const tag = input.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input') {
      const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(input, ${promptVarName});
      else input.value = ${promptVarName};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      input.textContent = ${promptVarName};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  `,

  getSubmitScript: () => `
    const sendBtn = queryFirst(sendSels);
    const canClick = sendBtn && !sendBtn.disabled && !sendBtn.classList.contains('disabled') && sendBtn.getAttribute('aria-disabled') !== 'true';
    if (canClick) {
      sendBtn.click();
    } else {
      const fire = (type) => input.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
      }));
      fire('keydown'); fire('keypress'); fire('keyup');
    }
  `,

  getIsGeneratingScript: () => `
    for (const s of stopSels) {
      try {
        const el = document.querySelector(s);
        if (el && el.offsetParent !== null) return true;
      } catch {}
    }
    const streaming = document.querySelector('.result-streaming');
    if (streaming && streaming.offsetParent !== null) return true;
    return false;
  `,

  getIsPausedScript: () => `
    const btns = document.querySelectorAll('button, [role="button"]');
    for (const b of btns) {
      if (b.offsetParent === null) continue;
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.textContent || '')).trim().toLowerCase();
      if (/\\b(continue|继续生成|继续)\\b/i.test(label)) return b;
    }
    return null;
  `,

  getIsBusyScript: () => `
    const els = document.querySelectorAll(
      '.qwen-chat-thinking-status-card-loading, .chat-response-message .ant-spin, .chat-response-message .animate-spin, .chat-response-message svg[class*="spin" i]'
    );
    for (const el of els) {
      if (el.offsetParent !== null) {
        if (el.closest('nav, aside, header, [role="navigation"], [class*="sidebar" i], [class*="history" i], [class*="user" i]')) continue;
        return true;
      }
    }
    return false;
  `,

  getCleanResponseScript: () => `
    clone.querySelectorAll('.response-message-footer, .qwen-chat-thinking-tool-status-card-wraper, .qwen-chat-tool-status-card, .qwen-chat-thinking-status-card-content, .qwen-thinking-selector').forEach(el => {
      if (el.closest('pre, code')) return;
      el.remove();
    });
    clone.querySelectorAll('.qwen-markdown-citation, .qwen-chat-markdown-tokens').forEach(el => {
      el.remove();
    });
  `,
}
