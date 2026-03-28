export interface TelegramIncomingMessage {
  chatId: string
  text: string
  messageId: number
  username?: string
  firstName?: string
}

type TelegramMessageHandler = (message: TelegramIncomingMessage) => void

export class TelegramBridge {
  private readonly token: string
  private readonly allowedChatId?: string
  private readonly baseUrl: string
  private polling = false
  private lastUpdateId = 0
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private onMessage?: TelegramMessageHandler

  constructor(token: string, allowedChatId?: string) {
    this.token = token
    this.allowedChatId = allowedChatId?.trim() || undefined
    this.baseUrl = `https://api.telegram.org/bot${this.token}`
  }

  setMessageHandler(handler: TelegramMessageHandler): void {
    this.onMessage = handler
  }

  start(): void {
    if (this.polling) return
    this.polling = true
    void this.startPolling()
  }

  stop(): void {
    this.polling = false
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    })
    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed with status ${response.status}`)
    }
  }

  private async startPolling(): Promise<void> {
    try {
      await this.deleteWebhook()
    } catch (error) {
      console.error('[Telegram] Failed to clear webhook before polling', error)
    }
    await this.pollLoop()
  }

  private async deleteWebhook(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
    })

    if (!response.ok) {
      throw new Error(`Telegram deleteWebhook failed with status ${response.status}`)
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.polling) return
    this.pollTimer = setTimeout(() => {
      void this.pollLoop()
    }, delayMs)
  }

  private async pollLoop(): Promise<void> {
    if (!this.polling) return

    try {
      const url = new URL(`${this.baseUrl}/getUpdates`)
      url.searchParams.set('timeout', '20')
      url.searchParams.set('allowed_updates', JSON.stringify(['message']))
      if (this.lastUpdateId > 0) {
        url.searchParams.set('offset', String(this.lastUpdateId + 1))
      }

      const response = await fetch(url.toString())
      if (!response.ok) {
        console.error('[Telegram] getUpdates failed', response.status)
        this.scheduleNextPoll(5_000)
        return
      }

      const payload = await response.json() as {
        ok?: boolean
        result?: Array<{
          update_id: number
          message?: {
            message_id: number
            text?: string
            chat?: { id?: number | string }
            from?: { username?: string; first_name?: string }
          }
        }>
      }

      for (const update of payload.result ?? []) {
        this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id)
        const message = update.message
        if (!message) continue
        const text = message?.text?.trim()
        const rawChatId = message?.chat?.id
        const chatId = rawChatId === undefined || rawChatId === null ? '' : String(rawChatId)
        if (!text || !chatId) continue
        if (this.allowedChatId && chatId !== this.allowedChatId) continue

        this.onMessage?.({
          chatId,
          text,
          messageId: message.message_id,
          username: message.from?.username,
          firstName: message.from?.first_name,
        })
      }

      this.scheduleNextPoll(500)
    } catch (error) {
      console.error('[Telegram] pollLoop failed', error)
      this.scheduleNextPoll(5_000)
    }
  }
}
