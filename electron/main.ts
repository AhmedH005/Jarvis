import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { OpenClawBridge } from './openclaw'

let mainWindow: BrowserWindow | null = null
let bridge: OpenClawBridge | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,           // custom titlebar
    transparent: true,      // glass effect
    vibrancy: 'under-window', // macOS frosted glass
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
  })

  // Dev: load Vite dev server. Prod: load built index.html
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  bridge = new OpenClawBridge({
    baseUrl: 'http://localhost:18789',
    token: '8ff346e21c467aeb1f8a191d58d50b45a6489013e5cc662f',
  })

  registerIpcHandlers(bridge)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC handlers ───────────────────────────────────────────────────────────────

function registerIpcHandlers(b: OpenClawBridge): void {
  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())

  // OpenClaw: send a message and stream responses back to renderer
  ipcMain.handle('openclaw:send', async (event, payload: { message: string; conversationId?: string }) => {
    try {
      await b.sendMessage(payload.message, payload.conversationId, (chunk) => {
        // Stream each chunk back to renderer via event
        if (!event.sender.isDestroyed()) {
          event.sender.send('openclaw:chunk', chunk)
        }
      })
      if (!event.sender.isDestroyed()) {
        event.sender.send('openclaw:done')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!event.sender.isDestroyed()) {
        event.sender.send('openclaw:error', msg)
      }
    }
  })

  // OpenClaw: get status / health
  ipcMain.handle('openclaw:status', async () => {
    return b.getStatus()
  })

  // OpenClaw: list available skills
  ipcMain.handle('openclaw:skills', async () => {
    return b.getSkills()
  })

  // Shell: open external links safely
  ipcMain.handle('shell:open', (_event, url: string) => {
    shell.openExternal(url)
  })
}
