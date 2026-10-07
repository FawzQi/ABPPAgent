import type { WebChatProfile } from './types'

export const geminiProfile: WebChatProfile = {
  id: 'gemini',
  label: 'Gemini',
  url: 'https://gemini.google.com/app',
  inputSelectors: [
    'rich-textarea .ql-editor[contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"].ql-editor',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[aria-label*="prompt" i]',
  ],
  sendSelectors: [
    'button.send-button',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]',
    '.send-button-container button',
    'div[role="button"][aria-label*="Send" i]',
  ],
  responseSelectors: [
    'model-response',
    '.model-response-text',
    'message-content',
    '.response-container-content',
    'div.markdown',
    '.markdown',
  ],
  stopSelectors: [
    'button[aria-label*="Stop" i]',
    '.stop-button',
    'button[aria-label*="Stop response" i]',
  ],
  copySelectors: [
    'copy-button button',
    'button[aria-label*="Copy" i]',
    'button[data-test-id="copy-button"]',
    'button[title*="Copy" i]',
    'div[role="button"][aria-label*="Copy" i]',
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
      // Specialized injection for Gemini's Quill editor inside <rich-textarea>
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, ${promptVarName});
      } catch (e) {}

      // Fallback: Populate Quill paragraph structure if execCommand missed
      const currentText = (input.textContent || '').trim();
      if (!currentText || currentText === '') {
        const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lines = ${promptVarName}.split('\\n');
        input.innerHTML = lines.map(line => '<p>' + (line ? escapeHtml(line) : '<br>') + '</p>').join('');
      }

      // Notify Quill and parent <rich-textarea> component
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ${promptVarName} }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: ${promptVarName} }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const richTextarea = input.closest('rich-textarea');
      if (richTextarea) {
        richTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        richTextarea.dispatchEvent(new Event('change', { bubbles: true }));
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
      if (/\\b(stop|stop response)\\b/.test(label)) return true;
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
      if (/\\b(continue|resume|keep going)\\b/i.test(label)) {
        return b;
      }
    }
    return null;
  `,

  getIsBusyScript: () => `
    const els = document.querySelectorAll(
      'mat-progress-spinner, [role="progressbar"], svg[class*="sparkle" i], .sparkle-button, [aria-busy="true"], .animate-spin'
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
    // Prune Gemini thought blocks (<thought-container>, model-thought)
    clone.querySelectorAll('thought-container, model-thought, [class*="thought-container" i], [class*="thought" i]').forEach(el => {
      if (el.closest('pre, code')) return;
      el.remove();
    });
    // Prune Gemini action bars, source chips, and UI controls
    clone.querySelectorAll('source-chip, [class*="source" i], [class*="draft" i], [class*="action-bar" i], [class*="response-actions" i]').forEach(el => {
      if (el.closest('pre, code')) return;
      el.remove();
    });
  `,
}
