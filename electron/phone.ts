/**
 * Phone Bridge — Twilio backbone
 *
 * Runs entirely inside the Electron main process (Node.js).
 * No Twilio SDK required — uses native fetch for REST calls.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Architecture                                                   │
 * │                                                                 │
 * │  Renderer (phoneWorker.ts)                                      │
 * │      │  IPC invoke: phone:dial                                  │
 * │      ▼                                                          │
 * │  Electron main (phone.ts)                                       │
 * │      │  Twilio REST API POST /Calls.json                        │
 * │      ▼                                                          │
 * │  Twilio Cloud                                                   │
 * │      │  fetches TwiML from local HTTP server                    │
 * │      ▼                                                          │
 * │  Embedded HTTP server (localhost:PORT)                          │
 * │      /voice/twiml/:reqId  → call script TwiML                  │
 * │      /voice/inbound       → inbound call TwiML (greeting+rec)  │
 * │      /voice/status/:reqId → status callback                    │
 * │      /voice/transcription → recording transcription callback   │
 * │      │                                                          │
 * │      │  IPC send: phone:callUpdate → Renderer                  │
 * │      ▼                                                          │
 * │  Renderer: PhoneWorker updates Zustand store                   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID           — e.g. "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *   TWILIO_AUTH_TOKEN            — Twilio auth token
 *   TWILIO_PHONE_NUMBER          — E.164 number owned by your Twilio account
 *   CONCIERGE_PHONE_PORT         — Webhook server port (default: 3847)
 *   CONCIERGE_PHONE_WEBHOOK_URL  — Public base URL Twilio can reach
 *                                  e.g. "https://xyz.ngrok.io"
 *                                  Required for webhooks; can be omitted
 *                                  if only testing Twilio dial initiation.
 */

import http from 'node:http'
import { ipcMain, type BrowserWindow } from 'electron'
import { resolveVoiceProvider } from './voice'
import type {
  PhoneDialInput,
  PhoneDialResult,
  PhoneCallUpdate,
  PhoneWebhookConfig,
} from '../src/shared/phone-bridge'

// ── Config ────────────────────────────────────────────────────────────────────

function twilioConfig() {
  return {
    accountSid:  process.env['TWILIO_ACCOUNT_SID']  ?? '',
    authToken:   process.env['TWILIO_AUTH_TOKEN']   ?? '',
    fromNumber:  process.env['TWILIO_PHONE_NUMBER'] ?? '',
    port:        parseInt(process.env['CONCIERGE_PHONE_PORT'] ?? '3847', 10),
    webhookBase: (process.env['CONCIERGE_PHONE_WEBHOOK_URL'] ?? '').replace(/\/$/, ''),
  }
}

function hasCredentials(): boolean {
  const c = twilioConfig()
  return !!(c.accountSid && c.authToken && c.fromNumber)
}

export function getPhoneWebhookConfig(): PhoneWebhookConfig {
  const c = twilioConfig()
  return {
    port: c.port,
    publicBaseUrl: c.webhookBase || null,
    running: !!webhookServer,
    credentialsConfigured: hasCredentials(),
    twilioNumber: c.fromNumber || null,
  }
}

// ── In-memory call script store ───────────────────────────────────────────────
// Maps reqId → call script text fragments so the TwiML endpoint can serve them.

interface PendingScript {
  opening:    string
  objectives: string[]
  keyPoints:  string[]
  closing:    string
  mode:       'serious' | 'demo'
  contact:    string
}

const pendingScripts = new Map<string, PendingScript>()

// Maps callSid → reqId for status correlation
const sidToReqId = new Map<string, string>()

// ── TwiML generation ──────────────────────────────────────────────────────────

function buildOutboundTwiML(script: PendingScript): string {
  const voice = resolveVoiceProvider()
  const mode  = script.mode

  const parts: string[] = []

  // Opening
  parts.push(voice.toSayVerb(script.opening, mode))

  // Pause after opening to let the other party acknowledge
  parts.push('<Pause length="2"/>')

  // Objectives / key points as a natural series of sentences
  if (script.objectives.length > 0) {
    const objText = script.objectives.join('. ') + '.'
    parts.push(voice.toSayVerb(objText, mode))
  }

  if (script.keyPoints.length > 0) {
    const kpText = script.keyPoints.join('. ')
    parts.push('<Pause length="1"/>')
    parts.push(voice.toSayVerb(kpText, mode))
  }

  // Pause to let them respond
  parts.push('<Pause length="15"/>')

  // Closing
  parts.push(voice.toSayVerb(script.closing, mode))

  // Record the call for summary
  parts.push('<Record maxLength="60" transcribe="true" playBeep="false"/>')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${parts.join('\n  ')}\n</Response>`
}

function buildInboundTwiML(webhookBase: string): string {
  const voice = resolveVoiceProvider()

  const greeting = voice.toSayVerb(
    "Hello, you've reached the JARVIS concierge service for Ahmed. " +
    "I'm unable to take your call right now. " +
    "Please leave a message after the beep and Ahmed will get back to you shortly.",
    'serious',
  )

  const transcribeCallback = webhookBase
    ? `transcribeCallback="${webhookBase}/voice/transcription"`
    : ''

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  ${greeting}`,
    `  <Record maxLength="120" transcribe="true" playBeep="true" ${transcribeCallback}/>`,
    '</Response>',
  ].join('\n')
}

function buildFallbackTwiML(): string {
  const voice = resolveVoiceProvider()
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  ${voice.toSayVerb("We're sorry, an error occurred. Please try again later.", 'serious')}`,
    '</Response>',
  ].join('\n')
}

// ── HTTP body parser ──────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of raw.split('&')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '))
    const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '))
    out[k] = v
  }
  return out
}

// ── Embedded HTTP server ──────────────────────────────────────────────────────

let webhookServer: http.Server | null = null
let notifyRenderer: ((update: PhoneCallUpdate) => void) | null = null

function startWebhookServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    webhookServer = http.createServer(async (req, res) => {
      const url   = req.url ?? '/'
      const body  = req.method === 'POST' ? await readBody(req).catch(() => '') : ''
      const params = body ? parseFormBody(body) : {}

      const sendTwiML = (xml: string) => {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' })
        res.end(xml)
      }

      const sendOk = () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
      }

      // ── GET /health ────────────────────────────────────────────────────────
      if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, service: 'jarvis-phone' }))
        return
      }

      // ── POST /voice/inbound ── Twilio inbound call webhook ─────────────────
      if (url === '/voice/inbound' && req.method === 'POST') {
        const cfg = twilioConfig()
        console.log('[phone] inbound call from', params['From'])
        sendTwiML(buildInboundTwiML(cfg.webhookBase))
        // Notify renderer of inbound call start
        notifyRenderer?.({
          callSid:  params['CallSid'] ?? 'unknown',
          status:   'in-progress',
        })
        return
      }

      // ── POST /voice/twiml/:reqId ── Twilio fetches script for outbound call
      const twimlMatch = url.match(/^\/voice\/twiml\/([^/]+)$/)
      if (twimlMatch && req.method === 'POST') {
        const reqId  = twimlMatch[1]
        const script = pendingScripts.get(reqId)
        if (!script) {
          console.warn('[phone] TwiML requested for unknown reqId', reqId)
          sendTwiML(buildFallbackTwiML())
          return
        }
        sendTwiML(buildOutboundTwiML(script))
        pendingScripts.delete(reqId)
        return
      }

      // ── POST /voice/status/:reqId ── Twilio call status callback ──────────
      const statusMatch = url.match(/^\/voice\/status\/([^/]+)$/)
      if (statusMatch && req.method === 'POST') {
        const reqId      = statusMatch[1]
        const callSid    = params['CallSid']    ?? ''
        const callStatus = params['CallStatus'] ?? ''
        const duration   = parseInt(params['CallDuration'] ?? '0', 10)

        if (callSid && reqId) sidToReqId.set(callSid, reqId)

        console.log('[phone] status callback', { reqId, callSid, callStatus, duration })

        notifyRenderer?.({
          callSid,
          reqId,
          status:      callStatus as PhoneCallUpdate['status'],
          durationSecs: isNaN(duration) ? undefined : duration,
          errorMessage: params['ErrorMessage'],
        })

        sendOk()
        return
      }

      // ── POST /voice/transcription ── Recording transcription callback ──────
      if (url === '/voice/transcription' && req.method === 'POST') {
        const callSid       = params['CallSid']            ?? ''
        const transcription = params['TranscriptionText']  ?? ''
        const reqId         = sidToReqId.get(callSid)

        console.log('[phone] transcription received for', callSid, '→ reqId', reqId)

        if (callSid) {
          notifyRenderer?.({
            callSid,
            reqId,
            status:        'completed',
            transcription,
            recordingUrl:  params['RecordingUrl'],
          })
        }

        sendOk()
        return
      }

      // ── 404 ────────────────────────────────────────────────────────────────
      res.writeHead(404)
      res.end('not found')
    })

    webhookServer.on('error', (err) => {
      console.error('[phone] webhook server error', err)
      reject(err)
    })

    webhookServer.listen(port, '127.0.0.1', () => {
      console.log(`[phone] webhook server running on http://127.0.0.1:${port}`)
      resolve()
    })
  })
}

// ── Twilio REST API — outbound call ───────────────────────────────────────────

async function twilioDialOutbound(params: {
  to:              string
  from:            string
  twimlUrl:        string
  statusCallback:  string
  accountSid:      string
  authToken:       string
}): Promise<{ ok: true; callSid: string } | { ok: false; error: string }> {
  const authString = Buffer.from(`${params.accountSid}:${params.authToken}`).toString('base64')
  const body = new URLSearchParams({
    To:                   params.to,
    From:                 params.from,
    Url:                  params.twimlUrl,
    StatusCallback:       params.statusCallback,
    StatusCallbackMethod: 'POST',
    StatusCallbackEvent:  'initiated ringing answered completed',
    Record:               'true',
    RecordingChannels:    'mono',
  })

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/Calls.json`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    )

    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (!res.ok) {
      const message = (data['message'] as string | undefined) ?? `Twilio error ${res.status}`
      return { ok: false, error: message }
    }

    const sid = data['sid'] as string | undefined
    if (!sid) return { ok: false, error: 'Twilio returned no Call SID' }

    return { ok: true, callSid: sid }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

export function registerPhoneIpcHandlers(mainWindow: BrowserWindow): void {
  const cfg = twilioConfig()

  // Wire renderer notification callback
  notifyRenderer = (update: PhoneCallUpdate) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('phone:callUpdate', update)
    }
  }

  // ── phone:dial ─────────────────────────────────────────────────────────────
  ipcMain.handle('phone:dial', async (_, input: PhoneDialInput): Promise<PhoneDialResult> => {
    console.log('[phone] dial requested', { reqId: input.reqId, to: input.to, contact: input.contact })

    if (!hasCredentials()) {
      console.warn('[phone] dial failed — no Twilio credentials')
      return {
        ok:        false,
        error:     'Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)',
        errorCode: 'no_credentials',
      }
    }

    const freshCfg = twilioConfig()

    if (!freshCfg.webhookBase) {
      console.warn('[phone] CONCIERGE_PHONE_WEBHOOK_URL not set — Twilio cannot reach TwiML endpoint')
      return {
        ok:        false,
        error:     'CONCIERGE_PHONE_WEBHOOK_URL not configured. Twilio needs a public URL to fetch the call script. Set this to your ngrok/Tailscale URL.',
        errorCode: 'no_webhook_url',
      }
    }

    // Store the script so the TwiML endpoint can serve it
    const script = input.callScript
    pendingScripts.set(input.reqId, {
      opening:    script?.opening    ?? `Hello, I'm calling on behalf of Ahmed. ${input.instruction}`,
      objectives: script?.objectives ?? [input.instruction],
      keyPoints:  script?.keyPoints  ?? [],
      closing:    script?.closing    ?? 'Thank you for your time. Have a great day.',
      mode:       input.mode,
      contact:    input.contact,
    })

    const twimlUrl       = `${freshCfg.webhookBase}/voice/twiml/${input.reqId}`
    const statusCallback = `${freshCfg.webhookBase}/voice/status/${input.reqId}`

    const result = await twilioDialOutbound({
      to:             input.to,
      from:           freshCfg.fromNumber,
      twimlUrl,
      statusCallback,
      accountSid:     freshCfg.accountSid,
      authToken:      freshCfg.authToken,
    })

    if (!result.ok) {
      pendingScripts.delete(input.reqId)
      console.error('[phone] Twilio dial failed', result.error)
      return { ok: false, error: result.error, errorCode: 'twilio_error' }
    }

    // Correlate SID → reqId for later status callbacks
    sidToReqId.set(result.callSid, input.reqId)
    console.log('[phone] call initiated', { callSid: result.callSid, reqId: input.reqId })

    return { ok: true, callSid: result.callSid }
  })

  // ── phone:webhook:config ──────────────────────────────────────────────────
  ipcMain.handle('phone:webhook:config', (): PhoneWebhookConfig => getPhoneWebhookConfig())
}

// ── Module init ───────────────────────────────────────────────────────────────

/**
 * Start the phone bridge:
 *   1. Launch embedded HTTP server on configured port
 *   2. Register IPC handlers
 *
 * Call from Electron app.whenReady().
 */
export async function initPhoneBridge(mainWindow: BrowserWindow): Promise<void> {
  const { port } = twilioConfig()

  try {
    await startWebhookServer(port)
  } catch (err) {
    console.error('[phone] failed to start webhook server', err)
    // Non-fatal — dial can still work via alternate TwiML hosting
  }

  registerPhoneIpcHandlers(mainWindow)
  console.log('[phone] bridge initialised')
}
