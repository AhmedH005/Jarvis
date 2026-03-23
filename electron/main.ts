import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { OpenClawBridge } from './openclaw'
import type { StreamEvent } from './openclaw'
import {
  handleBuilderCreateExecutionRequest,
  handleBuilderCreateRemediationRequest,
  handleBuilderFinalizeExecution,
  handleBuilderListExecutionHistory,
  handleBuilderPlanTask,
  handleBuilderSettleExecutionRequest,
  handleBuilderStartExecution,
  handleCheckerVerifyRun,
} from './builder-bridge'

let mainWindow: BrowserWindow | null = null
let bridge: OpenClawBridge | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth:  1100,
    minHeight: 700,
    frame:       false,         // custom titlebar
    transparent: true,          // glass effect
    vibrancy:    'under-window', // macOS frosted glass
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload:          join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
    titleBarStyle:        'hidden',
    trafficLightPosition: { x: 16, y: 16 },
  })

  // electron-vite 2.x sets ELECTRON_RENDERER_URL in dev mode
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.webContents.session.clearCache().catch(() => undefined)
    const bust = `${devUrl}${devUrl.includes('?') ? '&' : '?'}jarvis-dev=${Date.now()}`
    mainWindow.loadURL(bust)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  bridge = new OpenClawBridge({
    baseUrl: 'http://localhost:18789',
    token:   '8ff346e21c467aeb1f8a191d58d50b45a6489013e5cc662f',
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

  /**
   * OpenClaw: send a message, stream events back via 'openclaw:stream'.
   *
   * Event shape sent to renderer:
   *   { type: 'start'|'token'|'end'|'error'|'log', payload: string, meta?: {...} }
   */
  ipcMain.handle(
    'openclaw:send',
    async (event, payload: {
      message:        string
      conversationId?: string
      history?:       Array<{ role: string; content: string }>
    }) => {
      const send = (e: StreamEvent) => {
        if (!event.sender.isDestroyed()) event.sender.send('openclaw:stream', e)
      }
      try {
        await b.sendMessage(payload.message, payload.conversationId, payload.history ?? [], send)
      } catch (err: unknown) {
        send({ type: 'error', payload: err instanceof Error ? err.message : String(err) })
      }
    }
  )

  // OpenClaw: health status
  ipcMain.handle('openclaw:status', async () => b.getStatus())

  // OpenClaw: skills list
  ipcMain.handle('openclaw:skills', async () => b.getSkills())

  // Shell: safe external URL open
  ipcMain.handle('shell:open', (_event, url: string) => shell.openExternal(url))

  // FS: read backend markdown files (read-only, local paths only)
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      return { ok: true, content: await readFile(filePath, 'utf-8') }
    } catch (err) {
      return { ok: false, content: '', error: String(err) }
    }
  })

  // Builder: plan-only packaging bridge
  ipcMain.handle('builder:planTask', async (_event, payload) => handleBuilderPlanTask(payload))

  // Builder: execution-request packaging bridge
  ipcMain.handle('builder:createExecutionRequest', async (_event, payload) =>
    handleBuilderCreateExecutionRequest(payload)
  )

  // Builder: remediation-request packaging bridge
  ipcMain.handle('builder:createRemediationRequest', async (_event, payload) =>
    handleBuilderCreateRemediationRequest(payload)
  )

  // Builder: approval settlement bridge
  ipcMain.handle('builder:settleExecutionRequest', async (_event, payload) =>
    handleBuilderSettleExecutionRequest(payload)
  )

  // Builder: execution start bridge
  ipcMain.handle('builder:startExecution', async (_event, payload) =>
    handleBuilderStartExecution(payload, b)
  )

  // Builder: execution finalization bridge
  ipcMain.handle('builder:finalizeExecution', async (_event, payload) =>
    handleBuilderFinalizeExecution(payload)
  )

  // Builder: execution history query bridge
  ipcMain.handle('builder:listExecutionHistory', async (_event, payload) =>
    handleBuilderListExecutionHistory(payload)
  )

  // Checker: manual finalized-run verification bridge
  ipcMain.handle('checker:verifyRun', async (_event, payload) =>
    handleCheckerVerifyRun(payload)
  )
}
