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

// The user's own USD/THB rate (e.g. copied from Dime!), if they set one. A
// per-device convenience like the sync time, so localStorage it is.
const USD_THB_KEY = 'usdThbOverride'

export function getUsdThbOverride(): number | null {
  try {
    const value = Number(localStorage.getItem(USD_THB_KEY))
    return value > 0 ? value : null
  } catch {
    return null
  }
}

export function setUsdThbOverride(rate: number | null): void {
  try {
    if (rate) localStorage.setItem(USD_THB_KEY, String(rate))
    else localStorage.removeItem(USD_THB_KEY)
  } catch {
    // Storage blocked: the rate applies until the page is reloaded.
  }
}

// Whether amounts are hidden (the eye button). Per device, like the sync time.
const HIDE_AMOUNTS_KEY = 'hideAmounts'

export function getHideAmounts(): boolean {
  try {
    return localStorage.getItem(HIDE_AMOUNTS_KEY) === '1'
  } catch {
    return false
  }
}

export function saveHideAmounts(hide: boolean): void {
  try {
    if (hide) localStorage.setItem(HIDE_AMOUNTS_KEY, '1')
    else localStorage.removeItem(HIDE_AMOUNTS_KEY)
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

// Whether the dashboard shows baht or USD (the ฿ / $ switch). Per device.
const CURRENCY_KEY = 'currency'

export function getCurrency(): '฿' | '$' {
  try {
    return localStorage.getItem(CURRENCY_KEY) === 'USD' ? '$' : '฿'
  } catch {
    return '฿'
  }
}

export function saveCurrency(currency: '฿' | '$'): void {
  try {
    if (currency === '$') localStorage.setItem(CURRENCY_KEY, 'USD')
    else localStorage.removeItem(CURRENCY_KEY)
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.transactions, db.processedMessages, async () => {
    await db.transactions.clear()
    await db.processedMessages.clear()
  })
  setLastSyncedAt(null)
}
