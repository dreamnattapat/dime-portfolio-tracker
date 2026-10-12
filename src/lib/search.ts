/**
 * The search boxes above the assets and trades tables. Words are tickers
 * (part of one is enough: "AV" finds AVGO), and several find any of them
 * ("AVGO NVDA"). In the trades table a word can also be a trade type (ซื้อ,
 * ขาย, buy, sell) or the start of an order number, which narrows the list.
 */
import type { TransactionType } from '@/lib/dime/parser'

const TYPE_WORDS: Record<string, TransactionType> = {
  ซื้อ: 'Buy',
  BUY: 'Buy',
  ขาย: 'Sell',
  SELL: 'Sell',
  SEL: 'Sell',
  รางวัล: 'Reward',
  REWARD: 'Reward',
}

export type SearchQuery = { tickers: string[]; types: TransactionType[] }

export function parseSearch(text: string): SearchQuery {
  const words = text
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean)
  return {
    tickers: words.filter((w) => !TYPE_WORDS[w]),
    types: words.flatMap((w) => (TYPE_WORDS[w] ? [TYPE_WORDS[w]] : [])),
  }
}

/** Whether a row matches: any of the tickers (or order numbers), and any of the types. */
export function matchesSearch(
  query: SearchQuery,
  row: { security: string; transactionType?: TransactionType; orderId?: string },
): boolean {
  if (query.types.length && !(row.transactionType && query.types.includes(row.transactionType))) return false
  if (!query.tickers.length) return true
  const security = row.security.toUpperCase()
  return query.tickers.some(
    (t) => security.includes(t) || (/^\d+$/.test(t) && row.orderId != null && row.orderId.startsWith(t)),
  )
}
