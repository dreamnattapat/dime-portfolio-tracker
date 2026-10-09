/**
 * Minimal Gmail API client: finds Dime! confirmation emails and downloads
 * their PDF attachments. Calls go straight from the browser to Google.
 *
 * Ported from dime-auto-log-transactions/src/gmail_client.py.
 */

const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export const EMAIL_SUBJECT = '[Dime!] ใบยืนยันการซื้อขาย'
export const GMAIL_SEARCH_QUERY = `subject:"${EMAIL_SUBJECT}" has:attachment`

export class GmailError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GmailError'
    this.status = status
  }
}

export type DimeEmail = {
  messageId: string
  internalDateMs: number
  pdfFilename: string
  pdfBytes: Uint8Array
}

type MessagePart = {
  filename?: string
  body?: { attachmentId?: string }
  parts?: MessagePart[]
}

async function gmailGet<T>(accessToken: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${API_BASE}${path}${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new GmailError(response.status, body?.error?.message ?? `Gmail request failed (${response.status})`)
  }
  return response.json()
}

export async function findDimeMessageIds(accessToken: string, maxResults?: number): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(accessToken, '/messages', {
      q: GMAIL_SEARCH_QUERY,
      maxResults: String(maxResults ? Math.min(500, maxResults) : 500),
      ...(pageToken ? { pageToken } : {}),
    })
    ids.push(...(page.messages ?? []).map((m) => m.id))
    pageToken = page.nextPageToken
  } while (pageToken && !(maxResults && ids.length >= maxResults))
  return maxResults ? ids.slice(0, maxResults) : ids
}

export async function fetchPdfAttachment(accessToken: string, messageId: string): Promise<DimeEmail | null> {
  const message = await gmailGet<{ internalDate: string; payload?: MessagePart }>(
    accessToken,
    `/messages/${messageId}`,
    { format: 'full' },
  )

  const pdfPart = findPdfPart(message.payload?.parts ?? [])
  const attachmentId = pdfPart?.body?.attachmentId
  if (!pdfPart || !attachmentId) return null

  const attachment = await gmailGet<{ data: string }>(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  )

  return {
    messageId,
    internalDateMs: Number(message.internalDate),
    pdfFilename: pdfPart.filename || `${messageId}.pdf`,
    pdfBytes: decodeBase64Url(attachment.data),
  }
}

function findPdfPart(parts: MessagePart[]): MessagePart | null {
  for (const part of parts) {
    if (part.filename?.toLowerCase().endsWith('.pdf')) return part
    const nested = part.parts && findPdfPart(part.parts)
    if (nested) return nested
  }
  return null
}

function decodeBase64Url(data: string): Uint8Array {
  const binary = atob(data.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
