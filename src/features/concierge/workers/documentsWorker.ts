/**
 * Documents / Forms Worker
 *
 * Responsibilities:
 *   - read forms, PDFs, admin documents
 *   - extract key fields and information
 *   - summarise required next steps
 *   - prepare form-ready or submission-ready drafts
 *
 * V1 safety rule: never auto-submits. All submission actions go through approvals.
 */

import { useConciergeStore } from '@/store/concierge'
import type { DocumentItem, DocumentType } from '../conciergeTypes'

// ── Ingest a document ─────────────────────────────────────────────────────────

export function ingestDocument(params: {
  name: string
  type: DocumentType
  rawText?: string
}): DocumentItem {
  const store = useConciergeStore.getState()
  const doc: DocumentItem = {
    id: `doc-${Date.now()}`,
    name: params.name,
    type: params.type,
    extractedFields: {},
    nextSteps: [],
    draftReady: false,
    status: 'processing',
    uploadedAt: new Date().toISOString(),
  }
  store.addDocument(doc)
  store.setWorkerStatus('documents', 'running')
  store.logActivity('documents', `Document ingested: ${params.name}`, 'pending')

  if (params.rawText) {
    const fields = extractFieldsFromText(params.rawText)
    const steps = inferNextSteps(params.type, fields)
    store.updateDocument(doc.id, {
      extractedFields: fields,
      nextSteps: steps,
      summary: generateSummary(params.name, params.type, fields),
      status: 'reviewed',
    })
    store.logActivity(
      'documents',
      `Document processed: ${params.name}`,
      'success',
      `${Object.keys(fields).length} fields extracted`,
    )
  }

  store.setWorkerStatus('documents', 'idle')
  return doc
}

// ── Field extraction (V1: pattern-based, no LLM) ──────────────────────────────

const FIELD_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Full name', pattern: /(?:full name|name)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i },
  { label: 'Date', pattern: /(?:date|effective date)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\w+ \d{1,2},? \d{4})/i },
  { label: 'Address', pattern: /(?:address)[:\s]+(.{10,80}?)(?:\n|$)/i },
  { label: 'Email', pattern: /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i },
  { label: 'Phone', pattern: /(?:phone|tel|telephone)[:\s]+([\+\d\s\-\(\)]{7,18})/i },
  { label: 'Reference', pattern: /(?:ref(?:erence)?|case|claim|application)[:\s #]+([A-Z0-9\-]+)/i },
  { label: 'Amount', pattern: /(?:amount|total|fee|cost)[:\s£$€]+(\d[\d,]*(?:\.\d{2})?)/i },
  { label: 'Deadline', pattern: /(?:deadline|due|submit by|return by|by)[:\s]+(\w+ \d{1,2},? \d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i },
]

function extractFieldsFromText(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const { label, pattern } of FIELD_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) fields[label] = match[1].trim()
  }
  return fields
}

// ── Next-step inference ───────────────────────────────────────────────────────

function inferNextSteps(type: DocumentType, fields: Record<string, string>): string[] {
  const steps: string[] = []

  if (type === 'form' || type === 'application') {
    if (!fields['Full name']) steps.push('Fill in full name')
    if (!fields['Date']) steps.push('Add date')
    if (!fields['Email']) steps.push('Provide email address')
    steps.push('Review all fields before signing')
    steps.push('Submit or return signed copy')
  } else if (type === 'claim') {
    steps.push('Attach supporting documents')
    if (fields['Deadline']) steps.push(`Submit before: ${fields['Deadline']}`)
    steps.push('Keep a copy for your records')
  } else if (type === 'registration') {
    steps.push('Confirm registration details are accurate')
    steps.push('Pay any applicable fees')
  } else {
    steps.push('Read and review key sections')
    steps.push('Identify any required actions')
  }

  return steps
}

// ── Summary generation ────────────────────────────────────────────────────────

function generateSummary(
  name: string,
  type: DocumentType,
  fields: Record<string, string>,
): string {
  const parts: string[] = [`${type.charAt(0).toUpperCase() + type.slice(1)}: "${name}".`]
  if (Object.keys(fields).length > 0) {
    parts.push(`Key fields: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(', ')}.`)
  }
  return parts.join(' ')
}

// ── Prepare a draft for submission ────────────────────────────────────────────

export function prepareDraft(docId: string): void {
  const store = useConciergeStore.getState()
  store.updateDocument(docId, { draftReady: true })
  const doc = store.documents.find((d) => d.id === docId)
  store.logActivity(
    'documents',
    `Draft ready: ${doc?.name ?? docId}`,
    'success',
    'Awaiting approval to submit',
  )
}

// ── Queue submission for approval ─────────────────────────────────────────────

/** NEVER auto-submits. Always queues for user approval. */
export function queueSubmission(docId: string): void {
  const store = useConciergeStore.getState()
  const doc = store.documents.find((d) => d.id === docId)
  if (!doc) return

  store.updateDocument(docId, { status: 'pending_approval' })
  store.addApproval({
    id: `appr-doc-${docId}`,
    workerId: 'documents',
    title: `Submit: ${doc.name}`,
    description: `${doc.summary ?? doc.name}\n\nNext steps:\n${doc.nextSteps.map(s => `• ${s}`).join('\n')}`,
    riskLevel: 'high',
    status: 'pending',
    actionRef: `documents:submit:${docId}`,
    payload: { docId },
    createdAt: new Date().toISOString(),
  })
  store.logActivity(
    'documents',
    `Submission queued for approval: ${doc.name}`,
    'pending',
  )
}
