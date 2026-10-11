/**
 * US regulatory fees Dime! deducts from a sale after the confirmation is
 * issued ("ค่าธรรมเนียมรอจ่าย" in the app), so they aren't in its totals:
 *
 * - SEC fee: a % of the sale value.
 * - TAF: per share sold, at least 0.01 USD and at most 9.79 USD per trade.
 *
 * Both are rounded up to the cent, which matches the app (e.g. a 0.0232 USD
 * SEC fee shows as 0.03). Rates come from each confirmation's own footnote;
 * rows read before that was parsed fall back to the rates below (Oct 2026).
 */
import type { ParsedTransaction } from '@/lib/dime/parser'

const DEFAULT_SEC_FEE_PCT = 0.00206
const DEFAULT_TAF_PER_SHARE_USD = 0.000195
const TAF_MIN_USD = 0.01
const TAF_MAX_USD = 9.79

/** Rounds up to the cent, ignoring float noise just above a whole cent. */
function ceilCents(usd: number): number {
  return Math.ceil(usd * 100 - 1e-9) / 100
}

export type SellFees = { secUsd: number; tafUsd: number; totalUsd: number }

type FeeInputs = Pick<ParsedTransaction, 'transactionType' | 'units' | 'grossAmount'> &
  Partial<Pick<ParsedTransaction, 'secFeePct' | 'tafPerShareUsd'>>

export function otherSellFees(tx: FeeInputs): SellFees {
  if (tx.transactionType !== 'Sell') return { secUsd: 0, tafUsd: 0, totalUsd: 0 }
  const secPct = tx.secFeePct ?? DEFAULT_SEC_FEE_PCT
  const tafRate = tx.tafPerShareUsd ?? DEFAULT_TAF_PER_SHARE_USD
  const secUsd = secPct > 0 ? ceilCents((tx.grossAmount * secPct) / 100) : 0
  const tafUsd = tafRate > 0 ? Math.min(TAF_MAX_USD, Math.max(TAF_MIN_USD, ceilCents(tx.units * tafRate))) : 0
  return { secUsd, tafUsd, totalUsd: Math.round((secUsd + tafUsd) * 100) / 100 }
}

/** What actually reaches the account, in USD and THB: the confirmation's total less those fees. */
export function netAmounts(
  tx: FeeInputs & Pick<ParsedTransaction, 'totalAmount' | 'totalAmountThb' | 'fxRateThbUsd'>,
): { usd: number; thb: number | null; feesUsd: number } {
  const { totalUsd } = otherSellFees(tx)
  if (!totalUsd) return { usd: tx.totalAmount, thb: tx.totalAmountThb, feesUsd: 0 }
  // The fees in baht at the confirmation's own rate, like the rest of its baht figures.
  const rate =
    tx.fxRateThbUsd ?? (tx.totalAmountThb != null && tx.totalAmount ? tx.totalAmountThb / tx.totalAmount : null)
  return {
    usd: Math.round((tx.totalAmount - totalUsd) * 100) / 100,
    thb: tx.totalAmountThb == null || rate == null ? tx.totalAmountThb : tx.totalAmountThb - totalUsd * rate,
    feesUsd: totalUsd,
  }
}
