import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import crypto from 'node:crypto'

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
import { OpenClawBridge } from './openclaw'
import type { StreamEvent } from './openclaw'
import { TelegramBridge } from './telegram'
import { initPhoneBridge } from './phone'
import { registerGmailIpcHandlers, getGmailStatus } from './gmail'
import { registerGCalIpcHandlers } from './gcal'
import {
  JARVIS_PLANNER_BRIDGE_OFFLINE_MESSAGE,
  type PlannerApplyPlanningActionsPayload,
  type PlannerBridgeResult,
  type PlannerCreateManyFromIntakePayload,
} from '../src/shared/planner-bridge'
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
import type { RuntimeDiagnostics } from '../src/shared/runtime-bridge'
import { getSecuritySnapshot, readSecret, resolveSafePath } from './security'

let mainWindow: BrowserWindow | null = null
let bridge: OpenClawBridge | null = null
let telegramBridge: TelegramBridge | null = null

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
  registerGmailIpcHandlers()
  registerGCalIpcHandlers()
  createWindow()

  // Phone bridge — init after createWindow so mainWindow is set
  if (mainWindow) void initPhoneBridge(mainWindow)

  const telegramToken = readSecret('TELEGRAM_BOT_TOKEN')?.trim()
  if (telegramToken) {
    telegramBridge = new TelegramBridge(telegramToken, readSecret('TELEGRAM_ALLOWED_CHAT_ID'))
    telegramBridge.setMessageHandler((message) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send('telegram:message', message)
    })
    telegramBridge.start()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  telegramBridge?.stop()
  if (process.platform !== 'darwin') app.quit()
})

// ── Planner bridge ─────────────────────────────────────────────────────────────
// Pending calls: correlationId → resolve callback.
// Main sends 'planner:bridge:command' to renderer; renderer resolves via
// 'planner:bridge:result'.

const pendingPlannerCalls = new Map<string, (result: PlannerBridgeResult) => void>()

/**
 * Send a planner command to the renderer and await its result.
 * Used by both IPC handlers (renderer-initiated calls that round-trip through
 * main for validation) and any future main-process callers (e.g. OpenClaw tools).
 */
async function plannerBridgeCall(method: string, data: unknown): Promise<PlannerBridgeResult> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn(`[planner-bridge][main] plannerBridgeCall(${method}) — mainWindow unavailable`)
    return { success: false, error: JARVIS_PLANNER_BRIDGE_OFFLINE_MESSAGE }
  }
  const id = crypto.randomUUID()
  const wcId = mainWindow.webContents.id
  console.log(`[planner-bridge][main] → send command method=${method} id=${id} webContentsId=${wcId}`)
  return new Promise<PlannerBridgeResult>((resolve) => {
    const timeout = setTimeout(() => {
      pendingPlannerCalls.delete(id)
      console.warn(`[planner-bridge][main] ✗ timeout method=${method} id=${id} — renderer never replied`)
      resolve({ success: false, error: JARVIS_PLANNER_BRIDGE_OFFLINE_MESSAGE })
    }, 8000)
    pendingPlannerCalls.set(id, (result) => {
      clearTimeout(timeout)
      pendingPlannerCalls.delete(id)
      console.log(`[planner-bridge][main] ✓ result received method=${method} id=${id} success=${result.success}`)
      resolve(result)
    })
    mainWindow!.webContents.send('planner:bridge:command', { id, method, data })
  })
}

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
      agentId?:       string
    }) => {
      const send = (e: StreamEvent) => {
        if (!event.sender.isDestroyed()) event.sender.send('openclaw:stream', e)
      }
      try {
        await b.sendMessage(payload.message, payload.conversationId, payload.history ?? [], send, payload.agentId)
      } catch (err: unknown) {
        send({ type: 'error', payload: err instanceof Error ? err.message : String(err) })
      }
    }
  )

  // OpenClaw: health status
  ipcMain.handle('openclaw:status', async () => b.getStatus())

  // OpenClaw: skills list
  ipcMain.handle('openclaw:skills', async () => b.getSkills())

  // Telegram: outbound reply
  ipcMain.handle('telegram:reply', async (_event, payload: { chatId: string; text: string }) => {
    if (!telegramBridge) return { ok: false, error: 'Telegram bridge not configured' }
    await telegramBridge.sendMessage(payload.chatId, payload.text)
    return { ok: true }
  })

  // Shell: safe external URL open
  ipcMain.handle('shell:open', (_event, url: string) => shell.openExternal(url))

  ipcMain.handle('runtime:getDiagnostics', async (): Promise<RuntimeDiagnostics> => {
    const openclaw = await b.getStatus().catch((error: unknown) => ({
      online: false,
      error: error instanceof Error ? error.message : String(error),
    }))

    // readSecret() returns '' when NO_SECRETS_MODE=true (blocks access regardless of env).
    // process.env checks are used separately to distinguish "key absent" vs "key blocked by mode".
    const llmMissing = readSecret('ANTHROPIC_API_KEY') ? [] : ['ANTHROPIC_API_KEY']
    const elevenLabsMissing = readSecret('ELEVENLABS_API_KEY') ? [] : ['ELEVENLABS_API_KEY']
    const telegramMissing = readSecret('TELEGRAM_BOT_TOKEN') ? [] : ['TELEGRAM_BOT_TOKEN']

    // Direct env presence checks — independent of NO_SECRETS_MODE
    const llmKeyPresent = Boolean(process.env['ANTHROPIC_API_KEY']?.trim())
    const elevenLabsKeyPresent = Boolean(process.env['ELEVENLABS_API_KEY']?.trim())
    const telegramKeyPresent = Boolean(process.env['TELEGRAM_BOT_TOKEN']?.trim())

    return {
      checkedAt: new Date().toISOString(),
      safety: getSecuritySnapshot(),
      openclaw,
      gmail: getGmailStatus(),
      phone: {
        port: 0,
        publicBaseUrl: null,
        running: false,
        credentialsConfigured: false,
        twilioNumber: null,
      },
      llm: {
        provider: 'anthropic',
        configured: llmMissing.length === 0,
        keyPresentInEnv: llmKeyPresent,
        missing: llmMissing,
      },
      speech: {
        provider: 'elevenlabs',
        configured: elevenLabsMissing.length === 0,
        keyPresentInEnv: elevenLabsKeyPresent,
        missing: elevenLabsKeyPresent && elevenLabsMissing.length > 0
          ? ['ELEVENLABS_API_KEY (present in env but blocked by NO_SECRETS_MODE)']
          : elevenLabsMissing,
        voiceIdConfigured: Boolean(readSecret('ELEVENLABS_VOICE_ID')),
      },
      media: {
        provider: 'elevenlabs',
        configured: elevenLabsMissing.length === 0,
        keyPresentInEnv: elevenLabsKeyPresent,
        missing: elevenLabsKeyPresent && elevenLabsMissing.length > 0
          ? ['ELEVENLABS_API_KEY (present in env but blocked by NO_SECRETS_MODE)']
          : elevenLabsMissing,
      },
      telegram: {
        provider: 'telegram-bot',
        configured: telegramMissing.length === 0,
        keyPresentInEnv: telegramKeyPresent,
        missing: telegramMissing,
        restrictedToChatId: Boolean(readSecret('TELEGRAM_ALLOWED_CHAT_ID')?.trim()),
      },
    }
  })

  // FS: read backend markdown files (read-only, local paths only)
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const safePath = resolveSafePath(filePath)
      return { ok: true, content: await readFile(safePath, 'utf-8') }
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

  // ── Planner bridge ─────────────────────────────────────────────────────────
  // Renderer sends back the result of a bridge command.
  ipcMain.on('planner:bridge:result', (event, { id, result }: { id: string; result: PlannerBridgeResult }) => {
    console.log(`[planner-bridge][main] ← bridge result from webContentsId=${event.sender.id} id=${id} success=${result?.success}`)
    const resolve = pendingPlannerCalls.get(id)
    if (resolve) {
      resolve(result)
    } else {
      console.warn(`[planner-bridge][main] ← bridge result id=${id} had no pending call (already timed out?)`)
    }
  })

  ipcMain.handle('planner:ping', async (event): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:ping from webContentsId=${event.sender.id}`)
    return plannerBridgeCall('ping', null)
  })

  // Create a calendar event block in the planner store.
  ipcMain.handle('planner:createEvent', async (event, data: unknown): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:createEvent from webContentsId=${event.sender.id}`, data)
    const d = data as Record<string, unknown> | null
    if (!d || typeof d['title'] !== 'string' || typeof d['date'] !== 'string' || typeof d['startTime'] !== 'string') {
      console.warn('[planner-bridge][main] planner:createEvent validation failed', d)
      return { success: false, error: 'Invalid input: title, date, and startTime are required' }
    }
    return plannerBridgeCall('createEvent', d)
  })

  // Create a task in the planner store.
  ipcMain.handle('planner:createTask', async (event, data: unknown): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:createTask from webContentsId=${event.sender.id}`, data)
    const d = data as Record<string, unknown> | null
    if (!d || typeof d['title'] !== 'string') {
      console.warn('[planner-bridge][main] planner:createTask validation failed', d)
      return { success: false, error: 'Invalid input: title is required' }
    }
    return plannerBridgeCall('createTask', d)
  })

  // Atomically create intake-derived events/tasks.
  ipcMain.handle('planner:createManyFromIntake', async (event, data: unknown): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:createManyFromIntake from webContentsId=${event.sender.id}`, data)
    const d = data as PlannerCreateManyFromIntakePayload | null
    if (!d || !Array.isArray(d.events) || !Array.isArray(d.tasks)) {
      console.warn('[planner-bridge][main] planner:createManyFromIntake validation failed', d)
      return { success: false, error: 'Invalid input: events[] and tasks[] are required' }
    }
    return plannerBridgeCall('createManyFromIntake', d)
  })

  // List all calendar blocks in the planner store.
  ipcMain.handle('planner:listEvents', async (event): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:listEvents from webContentsId=${event.sender.id}`)
    return plannerBridgeCall('listEvents', null)
  })

  // Patch an existing calendar block.
  ipcMain.handle('planner:updateEvent', async (event, data: unknown): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:updateEvent from webContentsId=${event.sender.id}`, data)
    const d = data as Record<string, unknown> | null
    if (!d || typeof d['id'] !== 'string') {
      console.warn('[planner-bridge][main] planner:updateEvent validation failed — missing id')
      return { success: false, error: 'Invalid input: id is required' }
    }
    return plannerBridgeCall('updateEvent', d)
  })

  // Delete a calendar block by id.
  ipcMain.handle('planner:deleteEvent', async (event, data: unknown): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:deleteEvent from webContentsId=${event.sender.id}`, data)
    const d = data as Record<string, unknown> | null
    if (!d || typeof d['id'] !== 'string') {
      console.warn('[planner-bridge][main] planner:deleteEvent validation failed — missing id')
      return { success: false, error: 'Invalid input: id is required' }
    }
    return plannerBridgeCall('deleteEvent', d)
  })

  // Apply a planner optimization/refinement result against the live store.
  ipcMain.handle('planner:applyPlanningActions', async (event, data: unknown): Promise<PlannerBridgeResult> => {
    console.log(`[planner-bridge][main] IPC planner:applyPlanningActions from webContentsId=${event.sender.id}`)
    const d = data as PlannerApplyPlanningActionsPayload | null
    if (!d || !Array.isArray(d.actions) || !d.options || typeof d.options.summary !== 'string') {
      console.warn('[planner-bridge][main] planner:applyPlanningActions validation failed', d)
      return { success: false, error: 'Invalid input: actions and options.summary are required' }
    }
    return plannerBridgeCall('applyPlanningActions', d)
  })

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

      const apiKey = readSecret('ANTHROPIC_API_KEY')
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

  // ── LLM: non-streaming command classification (for model-assisted router) ─────
  // Returns { ok: true, text: string } with raw JSON from Claude,
  // or { ok: false, error: string, code: string } on failure.
  // Uses claude-haiku-4-5-20251001 for fast, cheap single-shot classification.
  ipcMain.handle('llm:classify', async (_event, { command }: { command: string }) => {
    const apiKey = readSecret('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return { ok: false, error: 'ANTHROPIC_API_KEY not set', code: 'credentials_missing' }
    }

    const systemPrompt = [
      'You are a command router for JARVIS, a personal AI assistant.',
      'Classify the user command into exactly one domain and return ONLY a JSON object — no prose, no explanation, no markdown.',
      '',
      'Domains:',
      '- "command": general assistant questions, system/runtime queries, unclear intent',
      '- "time": schedule, calendar, event, meeting, task, reminder, deadline, automation, recurring job',
      '- "concierge": email, mail, send, reply, booking, reservation, follow-up, personal admin, inbox',
      '- "creation": voice, TTS, audio, music, transcription, media generation, sound',
      '- "dev": code, build, implement, fix, refactor, debug, repository, programming, test',
      '- "memory": remember, recall, note, context, brainrepo, store, save, record',
      '- "finance": budget, money, expense, account, transaction, spending',
      '- "unknown": truly ambiguous — cannot determine from context',
      '',
      'Return this exact JSON schema (nothing else):',
      '{',
      '  "domain": "<one of the domains above>",',
      '  "intent": "<10 words max — what the user wants>",',
      '  "confidence": "high" | "medium" | "low",',
      '  "requires_approval": true | false,',
      '  "suggested_action": "stage" | "approve_and_stage" | "clarify" | "unavailable",',
      '  "entities": {',
      '    "dates": ["<date string>"],',
      '    "contacts": ["<name or @mention>"],',
      '    "keywords": ["<key term>"]',
      '  }',
      '}',
    ].join('\n')

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          stream: false,
          system: systemPrompt,
          messages: [{ role: 'user', content: command }],
        }),
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        const code = res.status === 401 ? 'credentials_invalid'
          : res.status === 429 ? 'rate_limited'
          : 'api_error'
        return { ok: false, error: `Claude API ${res.status}: ${errText}`, code }
      }

      const data = await res.json().catch(() => null)
      const text: string = (data as { content?: Array<{ type: string; text?: string }> } | null)?.content?.[0]?.text ?? ''

      if (!text) {
        return { ok: false, error: 'Empty response from classification model', code: 'empty_response' }
      }

      return { ok: true, text }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const isTimeout = message.includes('TimeoutError') || message.includes('timed out')
      return {
        ok: false,
        error: message,
        code: isTimeout ? 'timeout' : 'transport_error',
      }
    }
  })

  // ── Music generation: ElevenLabs Sound Generation ────────────────────────────
  ipcMain.handle('music:generate', async (_event, { prompt }: { prompt: string }) => {
    const apiKey = readSecret('ELEVENLABS_API_KEY')
    if (!apiKey) {
      console.warn('[Music] ELEVENLABS_API_KEY not set — music generation unavailable')
      return { ok: false, error: 'ELEVENLABS_API_KEY not set' }
    }
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: 22,
          prompt_influence: 0.3,
        }),
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('[Music] ElevenLabs API error:', res.status, errorText)
        return { ok: false, status: res.status, error: errorText }
      }
      const audio = Buffer.from(await res.arrayBuffer())
      console.log('[Music] ElevenLabs audio generated', { bytes: audio.byteLength })
      return { ok: true, mimeType: 'audio/mpeg', audioBase64: audio.toString('base64'), bytes: audio.byteLength }
    } catch (err) {
      console.error('[Music] ElevenLabs fetch error:', err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── TTS: generate speech via ElevenLabs ──────────────────────────────────────
  ipcMain.handle('tts:speak', async (_event, { text }: { text: string }) => {
    console.log('[TTS] ElevenLabs handler called', { textLength: text.length })
    const apiKey = readSecret('ELEVENLABS_API_KEY')
    if (!apiKey) {
      console.warn('[TTS] ELEVENLABS_API_KEY not set')
      return { ok: false, error: 'ELEVENLABS_API_KEY not set' }
    }
    const voiceId = readSecret('ELEVENLABS_VOICE_ID') || 'pNInz6obpgDQGcFmaJgB'
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
