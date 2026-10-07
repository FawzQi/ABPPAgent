import type { WebChatProfile } from './types'

export const chatgptProfile: WebChatProfile = {
  id: 'chatgpt',
  label: 'ChatGPT',
  url: 'https://chatgpt.com/',
  inputSelectors: [
    '#prompt-textarea',
    'div#prompt-textarea[contenteditable="true"]',
    'div[contenteditable="true"].ProseMirror',
    'div[contenteditable="true"]',
    'textarea[data-id="root"]',
  ],
  sendSelectors: [
    'button[data-testid="send-button"]',
    'button[data-testid="fruitjuice-send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'button[aria-label*="Send" i]',
  ],
  responseSelectors: [
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"]',
    'article[data-testid*="conversation-turn"] .markdown',
    'div.agent-turn',
    '.markdown.prose',
  ],
  stopSelectors: [
    'button[data-testid="stop-button"]',
    'button[aria-label="Stop generating"]',
    'button[aria-label*="Stop" i]',
  ],
  copySelectors: [
    'button[data-testid="copy-turn-action-button"]',
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
      // Specialized injection for ChatGPT's ProseMirror editor
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, ${promptVarName});
      } catch (e) {}

      // Fallback: If execCommand failed to populate the node, build ProseMirror paragraph structure
      const currentText = (input.textContent || '').trim();
      if (!currentText || currentText === '') {
        const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lines = ${promptVarName}.split('\\n');
        input.innerHTML = lines.map(line => '<p>' + (line ? escapeHtml(line) : '<br>') + '</p>').join('');
      }

      // Notify ProseMirror transaction listeners
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ${promptVarName} }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: ${promptVarName} }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
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
    const streaming = document.querySelector('.result-streaming, [data-is-streaming="true"]');
    if (streaming && streaming.offsetParent !== null) return true;

    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.offsetParent === null) continue;
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).toLowerCase();
      if (/\\b(stop|stop generating)\\b/.test(label)) return true;
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
      if (/\\b(continue generating|continue)\\b/i.test(label) || label === 'continue') {
        return b;
      }
    }
    return null;
  `,

  getIsBusyScript: () => `
    const els = document.querySelectorAll(
      '.result-streaming, [data-is-streaming="true"], [aria-busy="true"], .animate-spin, svg[class*="spin" i]'
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
    // Prune ChatGPT o1/o3 reasoning blocks and citations
    clone.querySelectorAll('details, [data-testid*="thought" i], [class*="thought" i]').forEach(el => {
      if (el.closest('pre, code')) return;
      el.remove();
    });
    // Prune inline citations, search pill links, footnotes
    clone.querySelectorAll('[data-citation], [data-testid*="citation" i], sup, a[target="_blank"][rel*="noreferrer"][href*="search"]').forEach(el => {
      el.remove();
    });
  `,
}
