export interface GmailMessageRecord {
  id: string
  threadId: string
  sender: string
  senderEmail?: string
  subject: string
  preview: string
  body?: string
  receivedAt: string
}

export interface GmailFetchResult {
  ok: boolean
  messages?: GmailMessageRecord[]
  error?: string
}

export interface GmailSendInput {
  to: string
  subject: string
  body: string
  threadId?: string
}

export interface GmailSendResult {
  ok: boolean
  id?: string
  threadId?: string
  error?: string
}

export interface GmailStatus {
  configured: boolean
  address?: string
  missing: string[]
}
