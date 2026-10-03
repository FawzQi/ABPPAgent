import type { BrowserWindow } from 'electron'
import type { WebChatTargetConfig } from './targets'

export class CdpAutomation {
  /**
   * Types text into the web chat composer and submits it.
   */
  static async deliverPrompt(
    win: BrowserWindow,
    target: WebChatTargetConfig,
    text: string,
  ): Promise<boolean> {
    if (win.isDestroyed()) throw new Error('Target window is destroyed')

    win.focus()

    const success: boolean = await win.webContents.executeJavaScript(`(() => {
      const inputSelectors = ${JSON.stringify(target.inputSelectors)};
      let inputEl = null;

      for (const sel of inputSelectors) {
        const el = document.querySelector(sel);
        if (el && (el.offsetWidth || el.offsetHeight)) {
          inputEl = el;
          break;
        }
      }

      if (!inputEl) {
        inputEl = document.querySelector('textarea, [contenteditable="true"]');
      }

      if (!inputEl) return false;

      inputEl.focus();

      // Set content depending on input type
      const textToInsert = ${JSON.stringify(text)};
      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        inputEl.value = textToInsert;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (inputEl.isContentEditable) {
        // ProseMirror or contenteditable div
        inputEl.innerText = textToInsert;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Find and click send button
      const sendSelectors = ${JSON.stringify(target.sendSelectors)};
      let sendBtn = null;
      for (const sel of sendSelectors) {
        const btn = document.querySelector(sel);
        if (btn && (btn.offsetWidth || btn.offsetHeight)) {
          sendBtn = btn;
          break;
        }
      }

      if (sendBtn) {
        setTimeout(() => {
          sendBtn.click();
        }, 100);
        return true;
      }

      // Fallback: simulate Enter key press
      setTimeout(() => {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        inputEl.dispatchEvent(enterEvent);
      }, 100);

      return true;
    })()`)

    return success
  }

  /**
   * Optional: hardware-level click using Chromium DevTools Protocol (CDP)
   */
  static async cdpClick(win: BrowserWindow, x: number, y: number): Promise<void> {
    if (!win.webContents.debugger.isAttached()) {
      win.webContents.debugger.attach('1.3')
    }
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
  }
}
