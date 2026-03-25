import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'

// Load .env from project root (no dotenv dependency needed).
// Runs synchronously at module load so process.env is populated before any handler fires.
try {
  const envPath = join(app.getAppPath(), '.env')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* .env absent — rely on shell environment */ }
console.log('[Main] ANTHROPIC_API_KEY loaded:', !!process.env['ANTHROPIC_API_KEY'])
console.log('[Main] ELEVENLABS_API_KEY loaded:', !!process.env['ELEVENLABS_API_KEY'])
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
      autoplayPolicy:   'no-user-gesture-required',
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

  // ── LLM: stream a response from Claude (Anthropic API) ─────────────────────
  ipcMain.handle(
    'llm:send',
    async (event, { message, history }: {
      message: string
      history?: Array<{ role: string; content: string }>
    }) => {
      const send = (e: { type: string; payload: string }) => {
        if (!event.sender.isDestroyed()) event.sender.send('llm:stream', e)
      }

      const apiKey = process.env['ANTHROPIC_API_KEY']
      if (!apiKey) {
        send({ type: 'error', payload: 'ANTHROPIC_API_KEY not set' })
        return
      }

      const messages = [...(history ?? []), { role: 'user', content: message }]

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            stream: true,
            system: 'You are JARVIS, a sharp and efficient AI assistant. Be concise and direct. No filler words or unnecessary pleasantries.',
            messages,
          }),
        })

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => res.statusText)
          send({ type: 'error', payload: `Claude API error ${res.status}: ${errText}` })
          return
        }

        // Parse Anthropic SSE stream
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue
            try {
              const evt = JSON.parse(data)
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                send({ type: 'token', payload: evt.delta.text })
              }
              if (evt.type === 'message_stop') {
                send({ type: 'end', payload: '' })
              }
            } catch { /* skip malformed SSE data */ }
          }
        }
      } catch (err: unknown) {
        send({ type: 'error', payload: err instanceof Error ? err.message : String(err) })
      }
    }
  )

  // ── TTS: generate speech via ElevenLabs ──────────────────────────────────────
  ipcMain.handle('tts:speak', async (_event, { text }: { text: string }) => {
    console.log('[TTS] ElevenLabs handler called', { textLength: text.length })
    const apiKey = process.env['ELEVENLABS_API_KEY']
    if (!apiKey) {
      console.warn('[TTS] ELEVENLABS_API_KEY not set')
      return { ok: false, error: 'ELEVENLABS_API_KEY not set' }
    }
    const voiceId = process.env['ELEVENLABS_VOICE_ID'] ?? 'pNInz6obpgDQGcFmaJgB'
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('[TTS] ElevenLabs API error:', res.status, errorText)
        return { ok: false, status: res.status, error: errorText }
      }
      const audio = Buffer.from(await res.arrayBuffer())
      console.log('[TTS] ElevenLabs audio generated', { bytes: audio.byteLength })
      return {
        ok: true,
        mimeType: 'audio/mpeg',
        audioBase64: audio.toString('base64'),
        bytes: audio.byteLength,
      }
    } catch (err) {
      console.error('[TTS] ElevenLabs fetch error:', err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
