import { clipboard, type BrowserWindow } from 'electron'
import type { WebChatTargetConfig } from './targets'

const CLIPBOARD_SETTLE_MS = 1500
const FOCUS_SETTLE_MS = 300

export class ResponseScraper {
  /**
   * Extract the latest assistant response from the web chat window.
   * Tries clipboard copy button first for full markdown fidelity;
   * falls back to cleaned DOM extraction.
   */
  static async extractLatestResponse(
    win: BrowserWindow,
    target: WebChatTargetConfig,
  ): Promise<string> {
    if (win.isDestroyed()) throw new Error('Target window destroyed')

    // 1. Try clipboard sentinel extraction
    try {
      win.focus()
      await new Promise((r) => setTimeout(r, FOCUS_SETTLE_MS))

      const sentinel = `__sentinel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}__`
      clipboard.writeText(sentinel)

      const clicked = await win.webContents.executeJavaScript(`(() => {
        const copySelectors = ${JSON.stringify(target.copySelectors || [])};
        // Look for copy buttons within assistant messages or at bottom of conversation
        for (const sel of copySelectors) {
          try {
            const buttons = Array.from(document.querySelectorAll(sel)).filter((el) => {
              // Exclude buttons inside user messages or code fences
              if (el.closest('[data-message-author-role="user"], .user-message')) return false;
              if (el.closest('pre, code')) return false;
              return !!(el.offsetWidth || el.offsetHeight);
            });

            if (buttons.length > 0) {
              const lastButton = buttons[buttons.length - 1];
              lastButton.click();
              return true;
            }
          } catch {}
        }
        return false;
      })()`)

      if (clicked) {
        await new Promise((r) => setTimeout(r, CLIPBOARD_SETTLE_MS))
        const clipText = await clipboard.readText()
        if (clipText && clipText !== sentinel && clipText.trim().length > 0) {
          return clipText.trim()
        }
      }
    } catch {
      // Fall through to DOM extraction
    }

    // 2. DOM extraction fallback
    const domText: string = await win.webContents.executeJavaScript(`(() => {
      const responseSelectors = ${JSON.stringify(target.responseSelectors)};
      for (const sel of responseSelectors) {
        try {
          const elements = Array.from(document.querySelectorAll(sel)).filter((el) => {
            if (el.closest('[data-message-author-role="user"], .user-message')) return false;
            return !!(el.offsetWidth || el.offsetHeight);
          });

          if (elements.length > 0) {
            const lastMsg = elements[elements.length - 1];
            // Clone and strip unwanted UI bits
            const clone = lastMsg.cloneNode(true);
            const junk = clone.querySelectorAll('button, svg, [role="button"], .ds-icon-button, [data-testid*="copy"]');
            junk.forEach((j) => j.remove());
            return (clone.innerText || clone.textContent || '').trim();
          }
        } catch {}
      }

      // Generic fallback: find last markdown or message container
      const generic = document.querySelectorAll('.markdown, [class*="message-content"], [class*="prose"]');
      if (generic.length > 0) {
        return (generic[generic.length - 1].innerText || '').trim();
      }

      return '';
    })()`)

    return domText.trim()
  }
}
