/**
 * The local database, IndexedDB via Dexie. It lives only in this browser, on
 * this device. Gmail is the source of truth: if this is cleared, a re-sync
 * rebuilds it.
 *
 * Replaces the Python version's dime_transactions.xlsx + processed_ids.json.
 */
import Dexie, { type EntityTable } from 'dexie'

import type { ParseResult } from '@/lib/dime/parser'

export type Transaction = ParseResult & {
  /** `${gmailMessageId}:${index within the email}` */
  id: string
  gmailMessageId: string
  /** When the email arrived, ISO 8601. */
  receivedAt: string
}

export type ProcessedMessage = {
  id: string
  processedAt: string
}

export const db = new Dexie('dime-portfolio-tracker') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  processedMessages: EntityTable<ProcessedMessage, 'id'>
}

db.version(1).stores({
  transactions: 'id, gmailMessageId, security, settlementDate',
  processedMessages: 'id',
})

// When the last sync finished. A convenience only, so it lives in
// localStorage rather than the database, and may be missing.
const LAST_SYNC_KEY = 'lastSyncedAt'

export function getLastSyncedAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY)
  } catch {
    return null
  }
}

export function setLastSyncedAt(iso: string | null): void {
  try {
    if (iso) localStorage.setItem(LAST_SYNC_KEY, iso)
    else localStorage.removeItem(LAST_SYNC_KEY)
  } catch {
    // Storage blocked (e.g. private browsing): the timestamp just isn't remembered.
  }
}

export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.transactions, db.processedMessages, async () => {
    await db.transactions.clear()
    await db.processedMessages.clear()
  })
  setLastSyncedAt(null)
}
