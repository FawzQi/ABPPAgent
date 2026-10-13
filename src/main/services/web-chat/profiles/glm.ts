import type { WebChatProfile } from './types'

export const glmProfile: WebChatProfile = {
  id: 'glm',
  label: 'GLM (Z.ai)',
  url: 'https://chat.z.ai/',
  inputSelectors: [
    'textarea#chat-input',
    'textarea.input-scroll',
    'textarea[placeholder*="Message" i]',
    'textarea',
  ],
  sendSelectors: [
    'button#send-message-button:not(:disabled)',
    '#send-message-button',
    'button.sendMessageButton:not(:disabled)',
    'button.sendMessageButton',
    'button[type="submit"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="发送" i]',
    'button.send-button',
  ],
  responseSelectors: [
    '[data-message-role="assistant"] .markdown-prose',
    '[data-message-role="assistant"] .markdown',
    '.chat-assistant .markdown-prose',
    '.chat-assistant .markdown',
    '[data-message-role="assistant"]',
    '.chat-assistant',
    'div.chat-assistant',
    'div.markdown-prose',
    'div.markdown',
  ],
  stopSelectors: [
    'button[aria-label="Stop"]',
    'button[aria-label*="Stop" i]',
    'button[aria-label*="停止" i]',
    'button.stop-button',
    '[data-testid*="stop" i]',
    'button[class*="stop" i]',
  ],
  copySelectors: [
    'button[aria-label="Copy"]',
    'button[aria-label*="Copy" i]',
    'button[aria-label*="复制" i]',
    'button[title*="Copy" i]',
    'button[title*="复制" i]',
    'button.copy-response-button',
    'button.copy-button',
    '[data-testid*="copy" i]',
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
      try { sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } catch {}
      try { sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch {}
      try { sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } catch {}
      try { sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })); } catch {}
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
    const streaming = document.querySelector('.result-streaming, [data-is-streaming="true"]');
    if (streaming && streaming.offsetParent !== null) return true;
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.offsetParent === null) continue;
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).toLowerCase();
      if (/\\b(stop|停止)\\b/.test(label)) return true;
    }
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
      '.chat-assistant .animate-spin, .chat-assistant svg[class*="spin" i], [data-message-role="assistant"] .animate-spin, [data-message-role="assistant"] svg[class*="spin" i], [data-is-streaming="true"], .thinking-chain-container svg[class*="spin" i]'
    );
    for (const el of els) {
      if (el.offsetParent !== null) {
        if (el.closest('nav, aside, header, [role="navigation"], [class*="sidebar" i], [class*="history" i], form, [class*="composer" i]')) continue;
        return true;
      }
    }
    return false;
  `,

  getCleanResponseScript: () => `
    clone.querySelectorAll('.thinking-chain-container, [class*="thinking-chain" i]').forEach(el => {
      if (el.closest('pre, code')) return;
      el.remove();
    });
  `,
}
