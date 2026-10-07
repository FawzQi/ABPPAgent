import type { WebChatTargetId } from '@shared/types'
import type { WebChatProfile } from './types'

export function createFallbackProfile(
  id: WebChatTargetId,
  label: string,
  url: string,
  overrides?: Partial<WebChatProfile>,
): WebChatProfile {
  return {
    id,
    label,
    url,
    inputSelectors: overrides?.inputSelectors ?? [
      'textarea#chat-input',
      'textarea[placeholder]',
      'div[contenteditable="true"]',
    ],
    sendSelectors: overrides?.sendSelectors ?? [
      'button[type="submit"]',
      'button[aria-label*="Send" i]',
      'div[role="button"][aria-label*="Send" i]',
    ],
    responseSelectors: overrides?.responseSelectors ?? [
      'div[class*="markdown"]',
      '[data-message-author-role="assistant"]',
    ],
    stopSelectors: overrides?.stopSelectors ?? [
      'button[aria-label*="Stop" i]',
      'div[role="button"][aria-label*="Stop" i]',
    ],
    copySelectors: overrides?.copySelectors ?? [
      'button[aria-label*="Copy" i]',
      'div[role="button"][aria-label*="Copy" i]',
    ],
    fileSelectors: overrides?.fileSelectors ?? ['input[type="file"]'],

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
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, ${promptVarName});
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${promptVarName} }));
        if (!input.textContent || input.textContent.trim().length === 0) {
          input.innerText = ${promptVarName};
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${promptVarName} }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    `,

    getSubmitScript: () => `
      const sendBtn = queryFirst(sendSels);
      const canClick = sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true';
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
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.offsetParent === null) continue;
        const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).toLowerCase();
        if (/\\bstop\\b/.test(label)) return true;
      }
      return false;
    `,

    getIsPausedScript: () => `
      const btns = document.querySelectorAll('button, [role="button"]');
      for (const b of btns) {
        if (b.offsetParent === null) continue;
        if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
        const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.textContent || '')).trim().toLowerCase();
        if (/google|apple|github|email|account|login|sign in|sign up|cookie|policy|terms/i.test(label)) continue;
        if (/\\b(continue|resume|keep going)\\b/i.test(label)) return b;
      }
      return null;
    `,

    getIsBusyScript: () => `
      const els = document.querySelectorAll(
        '[aria-busy="true"], .animate-spin, svg[class*="spin" i], mat-progress-spinner, [role="progressbar"]'
      );
      for (const el of els) {
        if (el.offsetParent !== null) {
          if (el.closest('nav, aside, [role="navigation"], [class*="sidebar" i], [class*="history" i]')) continue;
          return true;
        }
      }
      return false;
    `,

    getCleanResponseScript: () => `
      // Generic cleaner (no-op extra DOM removal)
    `,
    ...overrides,
  }
}

