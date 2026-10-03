import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc'
import { closeAllWebChatWindows } from './services/web-chat/web-chat-service'

// Strip automation flags so web LLM sites don't flag navigator.webdriver
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0f172a', // dark background
    show: false,
    autoHideMenuBar: true,
    title: 'ABPPAgent - Autonomous Web-Chat Coding Agent',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerIpcHandlers()
  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeAllWebChatWindows()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
