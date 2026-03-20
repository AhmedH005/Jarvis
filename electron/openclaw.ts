/**
 * OpenClawBridge — communicates with the OpenClaw local gateway.
 *
 * OpenClaw gateway: http://localhost:18789
 * Auth: Bearer token in Authorization header
 *
 * This module lives in the Electron main process so the auth token
 * is never exposed to the renderer process.
 */

export interface OpenClawConfig {
  baseUrl: string
  token: string
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

export interface StreamChunk {
  type: 'text' | 'tool_start' | 'tool_end' | 'error'
  content: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
}

export class OpenClawBridge {
  private config: OpenClawConfig

  constructor(config: OpenClawConfig) {
    this.config = config
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.token}`,
    }
  }

  async getStatus(): Promise<OpenClawStatus> {
    try {
      const res = await fetch(`${this.config.baseUrl}/v1/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        return { online: true, ...data }
      }
      return { online: false, error: `HTTP ${res.status}` }
    } catch (err: unknown) {
      return { online: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async getSkills(): Promise<OpenClawSkill[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/v1/skills`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return []
      return res.json()
    } catch {
      return []
    }
  }

  /**
   * Send a message to OpenClaw and stream the response.
   * Tries SSE first (preferred for streaming), falls back to plain POST.
   */
  async sendMessage(
    message: string,
    conversationId: string | undefined,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const body = JSON.stringify({
      message,
      conversation_id: conversationId,
      stream: true,
    })

    try {
      await this.sendSSE(body, onChunk)
    } catch {
      // Fallback: plain POST (no streaming)
      await this.sendPlain(body, onChunk)
    }
  }

  /**
   * SSE streaming path — parses `data: {...}` lines from the response body.
   */
  private async sendSSE(body: string, onChunk: (chunk: StreamChunk) => void): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/v1/message`, {
      method: 'POST',
      headers: { ...this.headers(), Accept: 'text/event-stream' },
      body,
    })

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`)
    }

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
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (raw === '[DONE]') return
        try {
          const parsed = JSON.parse(raw)
          onChunk(this.normalizeChunk(parsed))
        } catch {
          // non-JSON line, treat as raw text
          if (raw) onChunk({ type: 'text', content: raw })
        }
      }
    }
  }

  /**
   * Plain POST fallback — treats entire response as a single text chunk.
   */
  private async sendPlain(body: string, onChunk: (chunk: StreamChunk) => void): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/v1/message`, {
      method: 'POST',
      headers: this.headers(),
      body,
    })

    const data = await res.json().catch(async () => {
      const text = await res.text()
      return { text }
    })

    const content =
      data?.response ?? data?.message ?? data?.text ?? data?.content ?? JSON.stringify(data)

    onChunk({ type: 'text', content })
  }

  /**
   * Normalizes various OpenClaw response shapes into our StreamChunk format.
   */
  private normalizeChunk(raw: Record<string, unknown>): StreamChunk {
    // OpenClaw SSE events vary by version — handle multiple shapes
    if (raw.type === 'content_block_delta') {
      const delta = (raw.delta as Record<string, unknown>) ?? {}
      return { type: 'text', content: String(delta.text ?? delta.content ?? '') }
    }
    if (raw.type === 'tool_use' || raw.type === 'tool_start') {
      return {
        type: 'tool_start',
        content: String(raw.name ?? ''),
        toolName: String(raw.name ?? ''),
        toolInput: raw.input,
      }
    }
    if (raw.type === 'tool_result' || raw.type === 'tool_end') {
      return {
        type: 'tool_end',
        content: String(raw.output ?? raw.result ?? ''),
        toolName: String(raw.name ?? ''),
        toolOutput: raw.output ?? raw.result,
      }
    }
    // Generic text delta
    const text = raw.text ?? raw.content ?? raw.delta ?? raw.response
    if (text) return { type: 'text', content: String(text) }
    return { type: 'text', content: JSON.stringify(raw) }
  }
}
