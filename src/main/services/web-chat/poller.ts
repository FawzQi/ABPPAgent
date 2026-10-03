import type { BrowserWindow } from 'electron'
import type { WebChatStatus, WebChatTargetId } from '@shared/types'

export const STATUS_INSPECTION_SCRIPT = `(() => {
  const isVisible = (el) => {
    if (!el) return false;
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length > 0));
  };

  // 1. Detect PAUSED state (Continue / Resume / 继续)
  const allClickables = document.querySelectorAll('button, [role="button"], a');
  for (const b of allClickables) {
    if (!isVisible(b)) continue;
    const text = (b.textContent || '').trim();
    const label = (b.getAttribute('aria-label') || '').trim();
    const title = (b.getAttribute('title') || '').trim();
    const combined = (label + ' ' + title + ' ' + text).toLowerCase();

    const isExcluded = /\\bcontinue\\s+(with|to)\\b/i.test(combined) ||
      /\\b(terms|privacy|policy|google|apple|github|account|login|sign\\s*in)\\b/i.test(combined);

    if (!isExcluded) {
      if (
        /^(continue|resume|keep going|继续)$/i.test(text) ||
        /^(continue|resume|keep going|继续)$/i.test(label) ||
        /\\b(continue generating|continue thinking|resume generating|继续生成|继续思考)\\b/i.test(combined) ||
        (/\\b(continue|resume)\\b/i.test(combined) && combined.length < 35) ||
        /^(继续|继续生成|继续思考)$/.test(text)
      ) {
        return 'paused';
      }
    }
  }

  // 2. Detect WORKING state
  const stopSels = [
    'div[role="button"][aria-label*="Stop" i]',
    'button[aria-label*="Stop" i]',
    'div[role="button"][title*="Stop" i]',
    'button[title*="Stop" i]',
    '[aria-label*="停止" i]',
    '[title*="停止" i]',
    'button[data-testid="stop-button"]',
    'button[aria-label="Stop response"]',
    'button[aria-label="Stop generating"]',
    '.ds-icon-button[aria-label*="Stop" i]',
    '.ds-icon-button[aria-label*="停止" i]',
    '.ds-icon-button[title*="Stop" i]',
    '.ds-icon-button[title*="停止" i]',
    'div[role="button"][class*="stop" i]',
    'button[class*="stop" i]',
    '.ds-icon-button[class*="stop" i]',
  ];

  for (const s of stopSels) {
    try {
      const el = document.querySelector(s);
      if (isVisible(el)) return 'working';
    } catch {}
  }

  // DeepSeek reasoning or thinking block in progress
  const thinkingActive = document.querySelector('.ds-thinking-header:not(.ds-thinking-header--collapsed), [data-testid="thinking-in-progress"]');
  if (isVisible(thinkingActive)) return 'working';

  // Composer stop button
  const composer = document.querySelector('textarea#chat-input, textarea[placeholder], div[contenteditable="true"]')?.closest('div[class*="input" i], form');
  if (composer) {
    const composerStop = composer.querySelector(
      'div[role="button"][class*="stop" i], button[class*="stop" i], .ds-icon-button[class*="stop" i], [aria-label*="stop" i], [aria-label*="停止" i]'
    );
    if (isVisible(composerStop)) return 'working';

    const composerButtons = composer.querySelectorAll('button, [role="button"], .ds-icon-button');
    for (const b of composerButtons) {
      if (!isVisible(b)) continue;
      const rect = b.querySelector('svg rect');
      if (rect) {
        const w = parseFloat(rect.getAttribute('width') || '0');
        const h = parseFloat(rect.getAttribute('height') || '0');
        if (w >= 4 && h >= 4) return 'working';
      }
    }
  }

  return 'idle';
})()`

export const IDLE_CONFIRMATION_THRESHOLD = 2

export class StatusPoller {
  private static pollers = new Map<WebChatTargetId, NodeJS.Timeout>()
  private static idleStreaks = new Map<WebChatTargetId, number>()
  private static currentStatuses = new Map<WebChatTargetId, WebChatStatus>()
  private static listeners = new Set<(targetId: WebChatTargetId, status: WebChatStatus) => void>()

  static subscribe(listener: (targetId: WebChatTargetId, status: WebChatStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  static getStatus(targetId: WebChatTargetId): WebChatStatus {
    return this.currentStatuses.get(targetId) ?? 'idle'
  }

  static startPolling(targetId: WebChatTargetId, win: BrowserWindow): void {
    this.stopPolling(targetId)

    const poll = async () => {
      if (win.isDestroyed()) {
        this.stopPolling(targetId)
        return
      }

      try {
        const rawStatus: WebChatStatus = await win.webContents.executeJavaScript(STATUS_INSPECTION_SCRIPT)
        const prevStatus = this.currentStatuses.get(targetId) ?? 'idle'

        if (rawStatus === 'working' || rawStatus === 'paused') {
          this.idleStreaks.set(targetId, 0)
          if (prevStatus !== rawStatus) {
            this.currentStatuses.set(targetId, rawStatus)
            this.emitStatus(targetId, rawStatus)
          }
        } else {
          // raw is idle
          const streak = (this.idleStreaks.get(targetId) ?? 0) + 1
          this.idleStreaks.set(targetId, streak)

          if (prevStatus !== 'idle') {
            if (streak >= IDLE_CONFIRMATION_THRESHOLD) {
              this.currentStatuses.set(targetId, 'idle')
              this.emitStatus(targetId, 'idle')
            }
          }
        }
      } catch {
        // window navigation or script error
      }
    }

    const timer = setInterval(poll, 1000)
    this.pollers.set(targetId, timer)
  }

  static stopPolling(targetId: WebChatTargetId): void {
    const timer = this.pollers.get(targetId)
    if (timer) {
      clearInterval(timer)
      this.pollers.delete(targetId)
    }
  }

  static emitStatus(targetId: WebChatTargetId, status: WebChatStatus): void {
    for (const listener of this.listeners) {
      listener(targetId, status)
    }
  }
}
