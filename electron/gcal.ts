import { ipcMain } from 'electron'
import type {
  GCalStatus,
  GCalListEventsResult,
  GCalEventRecord,
} from '../src/shared/gcal-bridge'

interface GCalConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  calendarId: string
}

function gcalConfig(): GCalConfig {
  return {
    clientId:     process.env['GCAL_CLIENT_ID']     ?? '',
    clientSecret: process.env['GCAL_CLIENT_SECRET'] ?? '',
    refreshToken: process.env['GCAL_REFRESH_TOKEN'] ?? '',
    calendarId:   process.env['GCAL_CALENDAR_ID']   ?? 'primary',
  }
}

export function getGCalStatus(): GCalStatus {
  const cfg = gcalConfig()
  const missing = [
    !cfg.clientId     ? 'GCAL_CLIENT_ID'     : '',
    !cfg.clientSecret ? 'GCAL_CLIENT_SECRET' : '',
    !cfg.refreshToken ? 'GCAL_REFRESH_TOKEN' : '',
  ].filter(Boolean)
  return {
    configured: missing.length === 0,
    calendarId: cfg.calendarId || undefined,
    missing,
  }
}

async function getAccessToken(): Promise<string> {
  const cfg = gcalConfig()
  const status = getGCalStatus()
  if (!status.configured) {
    throw new Error(`GCal auth missing: ${status.missing.join(', ')}`)
  }

  const body = new URLSearchParams({
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type:    'refresh_token',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error(`GCal OAuth token refresh failed (${response.status})`)
  }
  const json = await response.json() as { access_token?: string }
  if (!json.access_token) throw new Error('GCal OAuth token refresh returned no access token')
  return json.access_token
}

async function gcalRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(formatGCalApiError(path, response.status, text))
  }
  return await response.json() as T
}

function formatGCalApiError(path: string, status: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: string; status?: string }
    }
    const message = parsed.error?.message ?? rawBody
    if (status === 401 || /invalid_grant|unauthenticated/i.test(message)) {
      return 'Google Calendar authentication failed. Recheck GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, and GCAL_REFRESH_TOKEN.'
    }
    if (status === 403) {
      return 'Google Calendar API access denied. Ensure the Calendar API is enabled in Google Cloud Console.'
    }
    return `Google Calendar request failed (${status}): ${message}`
  } catch {
    return `Google Calendar API ${path} failed (${status}): ${rawBody.slice(0, 200)}`
  }
}

interface GCalListResponse {
  items?: GCalEventRecord[]
  nextPageToken?: string
}

export function registerGCalIpcHandlers(): void {
  ipcMain.handle('gcal:status', (): GCalStatus => getGCalStatus())

  ipcMain.handle('gcal:listEvents', async (
    _event,
    params?: { timeMin?: string; timeMax?: string; maxResults?: number }
  ): Promise<GCalListEventsResult> => {
    try {
      const cfg = gcalConfig()
      const qp = new URLSearchParams({
        orderBy:      'startTime',
        singleEvents: 'true',
        maxResults:   String(params?.maxResults ?? 50),
      })
      if (params?.timeMin) qp.set('timeMin', params.timeMin)
      if (params?.timeMax) qp.set('timeMax', params.timeMax)

      const calId = encodeURIComponent(cfg.calendarId || 'primary')
      const data = await gcalRequest<GCalListResponse>(
        `calendars/${calId}/events?${qp.toString()}`
      )
      return { ok: true, events: data.items ?? [] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = /auth|oauth|unauthenticated/i.test(message)
        ? 'oauth_failure'
        : /denied|forbidden/i.test(message)
        ? 'api_disabled'
        : 'api_error'
      return { ok: false, error: message, code }
    }
  })

  ipcMain.handle('ics:getConfig', (): { icsUrl?: string; caldavUrl?: string } => {
    const icsUrl    = process.env['ICS_CALENDAR_URL']?.trim()
    const caldavUrl = process.env['CALDAV_URL']?.trim()
    return {
      ...(icsUrl    ? { icsUrl }    : {}),
      ...(caldavUrl ? { caldavUrl } : {}),
    }
  })

  ipcMain.handle('ics:fetchUrl', async (
    _event,
    url: string
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'JARVIS/1.0 (calendar sync)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) {
        return { ok: false, error: `ICS fetch failed (${response.status}) from ${url}` }
      }
      const text = await response.text()
      return { ok: true, text }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `ICS fetch error: ${message}` }
    }
  })
}
