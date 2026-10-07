import type { WebChatProfile } from './types'

export const deepseekProfile: WebChatProfile = {
  id: 'deepseek',
  label: 'DeepSeek',
  url: 'https://chat.deepseek.com/',
  inputSelectors: [
    'textarea#chat-input',
    'textarea[placeholder]',
    'div[contenteditable="true"]',
  ],
  sendSelectors: ['div[role="button"][aria-disabled="false"][class*="send"]'],
  responseSelectors: ['.ds-markdown', 'div[class*="markdown"]'],
  stopSelectors: [
    'div[role="button"][aria-label*="Stop" i]',
    'button[aria-label*="Stop" i]',
    '.ds-icon-button[aria-label*="Stop" i]',
    '.ds-icon-button[aria-label*="停止" i]',
    'div[role="button"][class*="stop" i]',
    'button[class*="stop" i]',
  ],
  copySelectors: [
    'div[role="button"][aria-label*="Copy" i]',
    'button[aria-label*="Copy" i]',
    'div[role="button"][title*="Copy" i]',
    'button[title*="Copy" i]',
    'div[role="button"][aria-label*="复制"]',
    'button[aria-label*="复制"]',
    'div[role="button"][title*="复制"]',
    'button[title*="复制"]',
    '.ds-icon-button[aria-label*="Copy" i]',
    '.ds-icon-button[title*="Copy" i]',
    '.ds-icon-button[aria-label*="复制"]',
    '[data-testid*="copy" i]',
    'button[class*="copy" i]',
    'div[role="button"][class*="copy" i]',
    '.ds-icon-button[class*="copy" i]',
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
    const composer = document.querySelector('textarea#chat-input')?.closest('div[class*="input" i], form');
    if (composer) {
      const composerButtons = composer.querySelectorAll('button, [role="button"], .ds-icon-button');
      for (const b of composerButtons) {
        if (b.offsetParent === null) continue;
        const rect = b.querySelector('svg rect');
        if (rect) {
          const w = parseFloat(rect.getAttribute('width') || '0');
          const h = parseFloat(rect.getAttribute('height') || '0');
          if (w >= 4 && h >= 4) return true;
        }
      }
    }
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
      if (/google|apple|github|email|account|login|sign in|sign up|cookie|policy|terms/i.test(label)) continue;
      if (
        /\\b(continue|resume|keep going|continue generating|continue thinking)\\b/i.test(label) ||
        /(继续生成|继续思考|继续)/.test(label)
      ) {
        return b;
      }
    }
    return null;
  `,

  getIsBusyScript: () => `
    const els = document.querySelectorAll(
      '[aria-busy="true"], .animate-spin, svg[class*="spin" i], mat-progress-spinner, [role="progressbar"], .ds-cursor, span[class~="cursor" i]'
    );
    for (const el of els) {
      if (el.offsetParent !== null) {
        if (el.closest('nav, aside, [role="navigation"], [class*="sidebar" i], [class*="history" i], [class*="chat-list" i]')) continue;
        return true;
      }
    }
    return false;
  `,

  getCleanResponseScript: () => `
    clone.querySelectorAll('.ds-thought, [class*="thought" i]').forEach(el => {
      // Keep main markdown, strip internal reasoning blocks if separate
      if (el.closest('pre, code')) return;
      if (el.classList.contains('ds-thought')) el.remove();
    });
  `,
}
