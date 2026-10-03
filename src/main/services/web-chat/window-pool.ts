import { app, BrowserWindow, session, type WebContents } from 'electron'
import type { WebChatTargetId } from '@shared/types'
import { WEB_CHAT_TARGETS } from './targets'

const PARTITION = 'persist:agent-webchat'
const GOOGLE_AUTH_FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0'
const GOOGLE_AUTH_HOSTS = ['accounts.google.com', 'accounts.youtube.com']

function isGoogleAuthHost(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return GOOGLE_AUTH_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
  } catch {
    return false
  }
}

function plainChromeUserAgent(): string {
  const current = app ? app.userAgentFallback : ''
  return current.replace(/\s*Electron\/[^\s]+/g, '').replace(/\s*ABPPAgent\/[^\s]+/g, '')
}

export class WindowPool {
  private static windows = new Map<WebChatTargetId, BrowserWindow>()
  private static isInitialized = false

  static init(): void {
    if (this.isInitialized || !app) return
    this.isInitialized = true

    // Intercept Google OAuth popups and navigation to inject Firefox UA
    app.on('web-contents-created', (_event, contents: WebContents) => {
      contents.on('did-start-navigation', (_navEvent, url, isInPlace, isMainFrame) => {
        if (!isMainFrame || isInPlace) return
        contents.setUserAgent(isGoogleAuthHost(url) ? GOOGLE_AUTH_FIREFOX_UA : plainChromeUserAgent())
      })
    })
  }

  static async ensureWindow(targetId: WebChatTargetId, show: boolean = false): Promise<BrowserWindow> {
    this.init()

    const existing = this.windows.get(targetId)
    if (existing && !existing.isDestroyed()) {
      if (show && !existing.isVisible()) {
        existing.show()
        existing.focus()
      }
      return existing
    }

    const config = WEB_CHAT_TARGETS.find((t) => t.id === targetId)
    if (!config) throw new Error(`Unknown target: ${targetId}`)

    const ses = session.fromPartition(PARTITION)
    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      show,
      title: `ABPPAgent - ${config.label}`,
      webPreferences: {
        partition: PARTITION,
        session: ses,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    win.webContents.setUserAgent(plainChromeUserAgent())

    win.on('close', (e) => {
      // Prevent destroying window when user clicks close, just hide it
      e.preventDefault()
      win.hide()
    })

    await win.loadURL(config.url)
    this.windows.set(targetId, win)
    return win
  }

  static getWindow(targetId: WebChatTargetId): BrowserWindow | undefined {
    const win = this.windows.get(targetId)
    return win && !win.isDestroyed() ? win : undefined
  }

  static showWindow(targetId: WebChatTargetId): void {
    const win = this.getWindow(targetId)
    if (win) {
      win.show()
      win.focus()
    }
  }

  static hideWindow(targetId: WebChatTargetId): void {
    const win = this.getWindow(targetId)
    if (win) {
      win.hide()
    }
  }

  static closeAll(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.removeAllListeners('close')
        win.destroy()
      }
    }
    this.windows.clear()
  }
}
