import { app } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import WebSocket, { type RawData } from 'ws'

export interface OpenClawConfig {
  baseUrl: string
  token: string
  model?: string
}

export interface OpenClawStatus {
  online: boolean
  model?: string
  version?: string
  error?: string
}

export interface OpenClawSkill {
  name: string
  enabled: boolean
  description?: string
}

export interface StreamEvent {
  type: 'start' | 'token' | 'end' | 'error' | 'log'
  payload: string
  meta?: {
    toolName?: string
    toolInput?: unknown
    toolOutput?: unknown
    isToolStart?: boolean
    isToolEnd?: boolean
  }
}

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

interface GatewayAuthContext {
  identity: DeviceIdentity
  token: string
  role: string
  scopes: string[]
  clientId: string
  clientMode: string
  displayName: string
  devicePlatform: string
  deviceFamily?: string
}

interface GatewayFrame {
  type?: string
  id?: string
  ok?: boolean
  event?: string
  payload?: unknown
  error?: {
    message?: string
  }
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export class OpenClawBridge {
  private config: OpenClawConfig

  constructor(config: OpenClawConfig) {
    this.config = { model: 'openai-codex/gpt-5.4', ...config }
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  private get healthUrl(): string {
    const url = new URL(this.config.baseUrl)
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
    url.pathname = '/health'
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  private get wsUrl(): string {
    const url = new URL(this.config.baseUrl)
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  }

  private get identityPath(): string {
    return path.join(app.getPath('userData'), 'openclaw-device.json')
  }

  private get openClawHome(): string {
    return path.join(app.getPath('home'), '.openclaw')
  }

  private ensureDir(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
  }

  private base64UrlEncode(buf: Buffer | Uint8Array): string {
    return Buffer.from(buf)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }

  private derivePublicKeyRaw(publicKeyPem: string): Buffer {
    const spki = crypto.createPublicKey(publicKeyPem).export({
      type: 'spki',
      format: 'der',
    })

    if (
      spki.length === ED25519_SPKI_PREFIX.length + 32 &&
      spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
    ) {
      return spki.subarray(ED25519_SPKI_PREFIX.length)
    }

    return spki
  }

  private fingerprintPublicKey(publicKeyPem: string): string {
    return crypto.createHash('sha256').update(this.derivePublicKeyRaw(publicKeyPem)).digest('hex')
  }

  private generateIdentity(): DeviceIdentity {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }).toString()

    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }).toString()

    return {
      deviceId: this.fingerprintPublicKey(publicKeyPem),
      publicKeyPem,
      privateKeyPem,
    }
  }

  private loadOrCreateDeviceIdentity(): DeviceIdentity {
    try {
      if (fs.existsSync(this.identityPath)) {
        const raw = fs.readFileSync(this.identityPath, 'utf8')
        const parsed = JSON.parse(raw) as Partial<DeviceIdentity> & { version?: number }
        if (
          parsed?.version === 1 &&
          typeof parsed.deviceId === 'string' &&
          typeof parsed.publicKeyPem === 'string' &&
          typeof parsed.privateKeyPem === 'string'
        ) {
          const derivedId = this.fingerprintPublicKey(parsed.publicKeyPem)
          if (derivedId !== parsed.deviceId) {
            const updated = {
              version: 1,
              deviceId: derivedId,
              publicKeyPem: parsed.publicKeyPem,
              privateKeyPem: parsed.privateKeyPem,
              createdAtMs: Date.now(),
            }

            fs.writeFileSync(this.identityPath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 })
            try {
              fs.chmodSync(this.identityPath, 0o600)
            } catch {}

            return {
              deviceId: derivedId,
              publicKeyPem: parsed.publicKeyPem,
              privateKeyPem: parsed.privateKeyPem,
            }
          }

          return {
            deviceId: parsed.deviceId,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem,
          }
        }
      }
    } catch {}

    const identity = this.generateIdentity()
    const stored = {
      version: 1,
      deviceId: identity.deviceId,
      publicKeyPem: identity.publicKeyPem,
      privateKeyPem: identity.privateKeyPem,
      createdAtMs: Date.now(),
    }

    this.ensureDir(this.identityPath)
    fs.writeFileSync(this.identityPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 })
    try {
      fs.chmodSync(this.identityPath, 0o600)
    } catch {}

    return identity
  }

  private buildDeviceAuthPayloadV3(params: {
    deviceId: string
    clientId: string
    clientMode: string
    role: string
    scopes: string[]
    signedAtMs: number
    token?: string | null
    nonce: string
    platform?: string | null
    deviceFamily?: string | null
  }): string {
    return [
      'v3',
      params.deviceId,
      params.clientId,
      params.clientMode,
      params.role,
      params.scopes.join(','),
      String(params.signedAtMs),
      params.token ?? '',
      params.nonce,
      params.platform ?? '',
      params.deviceFamily ?? '',
    ].join('|')
  }

  private signDevicePayload(privateKeyPem: string, payload: string): string {
    const key = crypto.createPrivateKey(privateKeyPem)
    return this.base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key))
  }

  private loadJsonFile<T>(filePath: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
    } catch {
      return null
    }
  }

  private loadTrustedCliAuth(): GatewayAuthContext | null {
    const identityPath = path.join(this.openClawHome, 'identity', 'device.json')
    const authPath = path.join(this.openClawHome, 'identity', 'device-auth.json')

    const identityData = this.loadJsonFile<Partial<DeviceIdentity> & { version?: number }>(identityPath)
    const authData = this.loadJsonFile<{
      tokens?: {
        operator?: {
          token?: unknown
          role?: unknown
          scopes?: unknown
        }
      }
    }>(authPath)

    if (
      !identityData ||
      identityData.version !== 1 ||
      typeof identityData.deviceId !== 'string' ||
      typeof identityData.publicKeyPem !== 'string' ||
      typeof identityData.privateKeyPem !== 'string'
    ) {
      return null
    }

    const token = authData?.tokens?.operator?.token
    const role = authData?.tokens?.operator?.role
    const scopes = authData?.tokens?.operator?.scopes

    if (typeof token !== 'string' || !token.trim()) return null

    const derivedId = this.fingerprintPublicKey(identityData.publicKeyPem)
    if (derivedId !== identityData.deviceId) return null

    return {
      identity: {
        deviceId: identityData.deviceId,
        publicKeyPem: identityData.publicKeyPem,
        privateKeyPem: identityData.privateKeyPem,
      },
      token,
      role: typeof role === 'string' && role.trim() ? role : 'operator',
      scopes: Array.isArray(scopes) && scopes.every((scope) => typeof scope === 'string')
        ? scopes
        : ['operator.admin', 'operator.write'],
      clientId: 'cli',
      clientMode: 'cli',
      displayName: 'jarvis-electron',
      devicePlatform: process.platform,
      deviceFamily: '',
    }
  }

  private resolveGatewayAuth(): GatewayAuthContext {
    const trustedCli = this.loadTrustedCliAuth()
    if (trustedCli) return trustedCli

    return {
      identity: this.loadOrCreateDeviceIdentity(),
      token: this.config.token,
      role: 'operator',
      scopes: ['operator.admin', 'operator.write'],
      clientId: 'gateway-client',
      clientMode: 'ui',
      displayName: 'jarvis-electron',
      devicePlatform: 'electron',
      deviceFamily: '',
    }
  }

  private extractText(message: unknown): string {
    if (!message) return ''

    if (typeof message === 'string') return message

    if (typeof message !== 'object') return ''

    const maybeText = (message as { text?: unknown }).text
    if (typeof maybeText === 'string') return maybeText

    const content = (message as { content?: unknown }).content
    if (typeof content === 'string') return content

    if (!Array.isArray(content)) return ''

    return content
      .flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const text = (item as { type?: unknown; text?: unknown }).type === 'text'
          ? (item as { text?: unknown }).text
          : undefined
        return typeof text === 'string' ? [text] : []
      })
      .join('')
  }

  async getStatus(): Promise<OpenClawStatus> {
    try {
      const res = await fetch(this.healthUrl, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      })

      if (!res.ok) return { online: false, error: `HTTP ${res.status}` }

      const data = await res.json().catch(() => ({}))

      return {
        online: true,
        model: this.config.model,
        version: typeof data?.version === 'string' ? data.version : undefined,
      }
    } catch (err: unknown) {
      return {
        online: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async getSkills(): Promise<OpenClawSkill[]> {
    return []
  }

  async startDetachedMessage(
    message: string,
    conversationId?: string,
    onComplete?: (text: string, state: 'final' | 'aborted' | 'error') => void,
    agentId?: string
  ): Promise<{ runId: string }> {
    const auth = this.resolveGatewayAuth()
    const { identity, clientId, clientMode, role, scopes } = auth
    const runId = crypto.randomUUID()
    const connectId = crypto.randomUUID()
    const sendId = crypto.randomUUID()
    // If agentId is provided, use the fully-qualified agent session key format
    // so the gateway routes this message to the correct isolated agent workspace.
    // Format: agent:<agentId>:<conversationKey>
    const rawKey = conversationId ?? 'main'
    const sessionKey = agentId ? `agent:${agentId}:${rawKey}` : rawKey

    return await new Promise<{ runId: string }>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)
      let finished = false
      let accepted = false
      let connectSent = false
      let latestText = ''

      const finish = (completionState: 'final' | 'aborted' | 'error') => {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        try {
          ws.close()
        } catch {}
        if (onComplete) {
          try {
            onComplete(latestText, completionState)
          } catch {}
        }
      }

      const cleanup = () => finish('final')

      const fail = (errorMessage: string) => {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        try {
          ws.close()
        } catch {}
        if (accepted) {
          if (onComplete) {
            try {
              onComplete(latestText, 'error')
            } catch {}
          }
        } else {
          reject(new Error(errorMessage))
        }
      }

      const accept = () => {
        if (accepted || finished) return
        accepted = true
        resolve({ runId })
      }

      const sendConnect = (nonce: string) => {
        if (connectSent) return
        connectSent = true

        const signedAtMs = Date.now()
        const payload = this.buildDeviceAuthPayloadV3({
          deviceId: identity.deviceId,
          clientId,
          clientMode,
          role,
          scopes,
          signedAtMs,
          token: auth.token,
          nonce,
          platform: auth.devicePlatform,
          deviceFamily: auth.deviceFamily ?? '',
        })

        const signature = this.signDevicePayload(identity.privateKeyPem, payload)

        ws.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: clientId,
              displayName: auth.displayName,
              version: app.getVersion(),
              platform: process.platform,
              mode: clientMode,
              instanceId: identity.deviceId,
            },
            role,
            scopes,
            caps: ['tool-events'],
            auth: {
              token: auth.token,
            },
            device: {
              id: identity.deviceId,
              publicKey: this.base64UrlEncode(this.derivePublicKeyRaw(identity.publicKeyPem)),
              signature,
              signedAt: signedAtMs,
              nonce,
            },
          },
        }))
      }

      const timeout = setTimeout(() => {
        if (!accepted) fail('OpenClaw gateway timed out before execution start acknowledgement')
        else cleanup()
      }, 15 * 60_000)

      ws.on('message', (raw: RawData) => {
        if (finished) return

        let frame: GatewayFrame
        try {
          frame = JSON.parse(String(raw))
        } catch {
          return
        }

        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const nonce = (frame.payload as { nonce?: unknown } | undefined)?.nonce
          if (typeof nonce === 'string' && nonce.trim()) sendConnect(nonce.trim())
          else fail('Gateway connect challenge missing nonce')
          return
        }

        if (frame.type === 'res' && frame.id === connectId) {
          if (!frame.ok) {
            fail(frame.error?.message ?? 'Gateway connect failed')
            return
          }

          ws.send(JSON.stringify({
            type: 'req',
            id: sendId,
            method: 'chat.send',
            params: {
              sessionKey,
              message,
              deliver: false,
              idempotencyKey: runId,
            },
          }))
          return
        }

        if (frame.type === 'res' && frame.id === sendId) {
          if (!frame.ok) {
            fail(frame.error?.message ?? 'Chat send failed')
            return
          }

          accept()
          return
        }

        if (frame.type !== 'event') return

        if (frame.event === 'agent') {
          const payload = frame.payload as {
            runId?: unknown
            stream?: unknown
            data?: { delta?: unknown; text?: unknown }
          } | undefined

          if (payload?.runId !== runId || payload.stream !== 'assistant') return

          const nextText = typeof payload.data?.text === 'string'
            ? payload.data.text
            : typeof payload.data?.delta === 'string'
              ? latestText + payload.data.delta
              : ''

          if (nextText) latestText = nextText
          return
        }

        if (frame.event === 'chat') {
          const payload = frame.payload as {
            runId?: unknown
            state?: unknown
            message?: unknown
            errorMessage?: unknown
          } | undefined

          if (payload?.runId !== runId) return

          const messageText = this.extractText(payload?.message)
          if (messageText) latestText = messageText

          if (payload?.state === 'final') {
            finish('final')
            return
          }

          if (payload?.state === 'aborted') {
            if (!accepted) fail('Request aborted before execution start acknowledgement')
            else finish('aborted')
            return
          }

          if (payload?.state === 'error') {
            const errorMsg = typeof payload.errorMessage === 'string' ? payload.errorMessage : 'Chat error'
            fail(errorMsg)
          }
        }
      })

      ws.on('error', (err: Error) => {
        fail(err instanceof Error ? err.message : String(err))
      })

      ws.on('close', () => {
        if (!accepted) fail('Gateway connection closed before execution start acknowledgement')
        else if (!finished) finish('error')
      })
    })
  }

  async sendMessage(
    message: string,
    conversationId: string | undefined,
    _history: Array<{ role: string; content: string }>,
    onEvent: (e: StreamEvent) => void
  ): Promise<void> {
    const auth = this.resolveGatewayAuth()
    const { identity, clientId, clientMode, role, scopes } = auth
    const runId = crypto.randomUUID()
    const connectId = crypto.randomUUID()
    const sendId = crypto.randomUUID()
    const sessionKey = conversationId ?? 'main'

    onEvent({ type: 'start', payload: '' })

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(this.wsUrl)
      let latestText = ''
      let finished = false
      let connectSent = false

      const finish = (finalEvent?: StreamEvent) => {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        if (finalEvent) onEvent(finalEvent)
        try {
          ws.close()
        } catch {}
        resolve()
      }

      const emitTextDelta = (nextText: string) => {
        if (!nextText || nextText === latestText) return

        const delta = nextText.startsWith(latestText)
          ? nextText.slice(latestText.length)
          : nextText

        latestText = nextText
        if (delta) onEvent({ type: 'token', payload: delta })
      }

      const sendConnect = (nonce: string) => {
        if (connectSent) return
        connectSent = true

        const signedAtMs = Date.now()
        const payload = this.buildDeviceAuthPayloadV3({
          deviceId: identity.deviceId,
          clientId,
          clientMode,
          role,
          scopes,
          signedAtMs,
          token: auth.token,
          nonce,
          platform: auth.devicePlatform,
          deviceFamily: auth.deviceFamily ?? '',
        })

        const signature = this.signDevicePayload(identity.privateKeyPem, payload)

        ws.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: clientId,
              displayName: auth.displayName,
              version: app.getVersion(),
              platform: process.platform,
              mode: clientMode,
              instanceId: identity.deviceId,
            },
            role,
            scopes,
            caps: ['tool-events'],
            auth: {
              token: auth.token,
            },
            device: {
              id: identity.deviceId,
              publicKey: this.base64UrlEncode(this.derivePublicKeyRaw(identity.publicKeyPem)),
              signature,
              signedAt: signedAtMs,
              nonce,
            },
          },
        }))
      }

      const timeout = setTimeout(() => {
        finish({ type: 'error', payload: 'OpenClaw gateway timed out' })
      }, 60_000)

      ws.on('message', (raw: RawData) => {
        if (finished) return

        let frame: GatewayFrame
        try {
          frame = JSON.parse(String(raw))
        } catch {
          return
        }

        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const nonce = (frame.payload as { nonce?: unknown } | undefined)?.nonce
          if (typeof nonce === 'string' && nonce.trim()) sendConnect(nonce.trim())
          else finish({ type: 'error', payload: 'Gateway connect challenge missing nonce' })
          return
        }

        if (frame.type === 'res' && frame.id === connectId) {
          if (!frame.ok) {
            finish({ type: 'error', payload: frame.error?.message ?? 'Gateway connect failed' })
            return
          }

          ws.send(JSON.stringify({
            type: 'req',
            id: sendId,
            method: 'chat.send',
            params: {
              sessionKey,
              message,
              deliver: false,
              idempotencyKey: runId,
            },
          }))
          return
        }

        if (frame.type === 'res' && frame.id === sendId) {
          if (!frame.ok) {
            finish({ type: 'error', payload: frame.error?.message ?? 'Chat send failed' })
          }
          return
        }

        if (frame.type !== 'event') return

        if (frame.event === 'agent') {
          const payload = frame.payload as {
            runId?: unknown
            stream?: unknown
            data?: { delta?: unknown; text?: unknown }
          } | undefined

          if (payload?.runId !== runId || payload.stream !== 'assistant') return

          const nextText = typeof payload.data?.text === 'string'
            ? payload.data.text
            : typeof payload.data?.delta === 'string'
              ? latestText + payload.data.delta
              : ''

          emitTextDelta(nextText)
          return
        }

        if (frame.event !== 'chat') return

        const payload = frame.payload as {
          runId?: unknown
          state?: unknown
          message?: unknown
          errorMessage?: unknown
        } | undefined

        if (payload?.runId !== runId) return

        if (payload.state === 'delta') {
          emitTextDelta(this.extractText(payload.message))
          return
        }

        if (payload.state === 'final') {
          emitTextDelta(this.extractText(payload.message))
          finish({ type: 'end', payload: '' })
          return
        }

        if (payload.state === 'aborted') {
          emitTextDelta(this.extractText(payload.message))
          finish({ type: 'error', payload: 'Request aborted' })
          return
        }

        if (payload.state === 'error') {
          finish({
            type: 'error',
            payload: typeof payload.errorMessage === 'string' ? payload.errorMessage : 'Chat error',
          })
        }
      })

      ws.on('error', (err: Error) => {
        finish({ type: 'error', payload: err instanceof Error ? err.message : String(err) })
      })

      ws.on('close', () => {
        if (!finished) finish({ type: 'error', payload: 'Gateway connection closed' })
      })
    })
  }
}
