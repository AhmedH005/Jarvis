import { ipcMain } from 'electron'
import type {
  GmailFetchResult,
  GmailMessageRecord,
  GmailSendInput,
  GmailSendResult,
  GmailStatus,
} from '../src/shared/gmail-bridge'

interface GmailConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  address: string
}

function formatGoogleApiError(path: string, status: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: {
        code?: number
        message?: string
        status?: string
        details?: Array<{ reason?: string }>
      }
    }
    const message = parsed.error?.message ?? rawBody
    const reason = parsed.error?.details?.[0]?.reason

    if (status === 403 && (reason === 'SERVICE_DISABLED' || /api has not been used|is disabled/i.test(message))) {
      return 'Gmail API is disabled for this Google Cloud project. Enable the Gmail API in Google Cloud Console, wait a minute, then refresh Inbox.'
    }
    if (status === 401 || /invalid_grant|invalid credentials|unauthenticated/i.test(message)) {
      return 'Gmail authentication failed. Recheck the refresh token, client credentials, and Gmail account, then refresh Inbox.'
    }

    return `Gmail request failed (${status}): ${message}`
  } catch {
    return `Gmail API ${path} failed (${status}): ${rawBody.slice(0, 200)}`
  }
}

function gmailConfig(): GmailConfig {
  return {
    clientId: process.env['GMAIL_CLIENT_ID'] ?? '',
    clientSecret: process.env['GMAIL_CLIENT_SECRET'] ?? '',
    refreshToken: process.env['GMAIL_REFRESH_TOKEN'] ?? '',
    address: process.env['GMAIL_ADDRESS'] ?? '',
  }
}

export function getGmailStatus(): GmailStatus {
  const cfg = gmailConfig()
  const missing = [
    !cfg.clientId ? 'GMAIL_CLIENT_ID' : '',
    !cfg.clientSecret ? 'GMAIL_CLIENT_SECRET' : '',
    !cfg.refreshToken ? 'GMAIL_REFRESH_TOKEN' : '',
    !cfg.address ? 'GMAIL_ADDRESS' : '',
  ].filter(Boolean)
  return {
    configured: missing.length === 0,
    address: cfg.address || undefined,
    missing,
  }
}

async function getAccessToken(): Promise<string> {
  const cfg = gmailConfig()
  const status = getGmailStatus()
  if (!status.configured) {
    throw new Error(`Gmail auth missing: ${status.missing.join(', ')}`)
  }

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error(`OAuth token refresh failed (${response.status})`)
  }
  const json = await response.json() as { access_token?: string }
  if (!json.access_token) throw new Error('OAuth token refresh returned no access token')
  return json.access_token
}

async function gmailRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(formatGoogleApiError(path, response.status, text))
  }
  return await response.json() as T
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64').toString('utf8')
}

function findHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string | undefined {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value
}

function extractBody(payload: any): string | undefined {
  if (payload?.body?.data) return base64UrlDecode(payload.body.data)
  if (!Array.isArray(payload?.parts)) return undefined
  for (const part of payload.parts) {
    const nested = extractBody(part)
    if (nested) return nested
  }
  return undefined
}

function parseMessage(json: any): GmailMessageRecord {
  const payload = json.payload ?? {}
  const headers = payload.headers ?? []
  const sender = findHeader(headers, 'From') ?? 'Unknown sender'
  const subject = findHeader(headers, 'Subject') ?? '(no subject)'
  const receivedAt = new Date(findHeader(headers, 'Date') ?? Date.now()).toISOString()
  const body = extractBody(payload)

  return {
    id: json.id,
    threadId: json.threadId ?? json.id,
    sender,
    senderEmail: sender.match(/<([^>]+)>/)?.[1],
    subject,
    preview: json.snippet ?? body?.slice(0, 140) ?? '',
    body,
    receivedAt,
  }
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function registerGmailIpcHandlers(): void {
  ipcMain.handle('gmail:status', (): GmailStatus => getGmailStatus())

  ipcMain.handle('gmail:fetchRecent', async (): Promise<GmailFetchResult> => {
    try {
      const list = await gmailRequest<{ messages?: Array<{ id: string }> }>('messages?maxResults=20&q=-in:chats')
      const ids = list.messages?.map((message) => message.id) ?? []
      const messages = await Promise.all(
        ids.map(async (id) => {
          const message = await gmailRequest<any>(`messages/${id}?format=full`)
          return parseMessage(message)
        }),
      )
      return { ok: true, messages }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('gmail:sendMessage', async (_event, input: GmailSendInput): Promise<GmailSendResult> => {
    try {
      const cfg = gmailConfig()
      const mime = [
        `From: Ahmed <${cfg.address}>`,
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        input.body,
      ].join('\r\n')

      const result = await gmailRequest<{ id: string; threadId: string }>('messages/send', {
        method: 'POST',
        body: JSON.stringify({
          raw: toBase64Url(mime),
          ...(input.threadId ? { threadId: input.threadId } : {}),
        }),
      })

      return { ok: true, id: result.id, threadId: result.threadId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })
}
