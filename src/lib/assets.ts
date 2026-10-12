/**
 * Profit and loss per security, the way the Dime! app shows it, in baht or USD.
 *
 * Unrealized P&L follows Dime!: (price - average cost) x units in USD, with
 * the average cost excluding fees; in baht, converted at today's USD/THB
 * rate. So it's the stock's own move; a change in the exchange rate since you
 * bought isn't counted as profit. Realized P&L uses the same average cost
 * (analytics.ts), so a row's total is the stock's own result before buy fees
 * (those, and the USD/THB move, are shown separately in the summary).
 */
import type { Analytics, LedgerEntry } from '@/lib/analytics'
import type { Timeline } from '@/lib/benchmark'
import type { Currency } from '@/lib/format'

export type AssetPnl = {
  security: string
  held: boolean
  /** Null while prices load (or if they failed) for a held asset. */
  units: number | null
  avgCostUsd: number | null
  priceUsd: number | null
  /** Money columns are in the requested currency. */
  value: number | null
  unrealized: number | null
  /** Price vs average cost, %. */
  unrealizedPct: number | null
  realized: number
  total: number | null
  /** Total P&L as % of everything ever spent buying it. */
  totalPct: number | null
  approximated: boolean
  /** Its trades (and splits), oldest first: where the realized P&L comes from. */
  history: LedgerEntry[]
}

export function computeAssetPnl(analytics: Analytics, timeline: Timeline | null, currency: Currency = '฿'): AssetPnl[] {
  const usd = currency === '$'
  return analytics.assets.map((asset) => {
    const open = analytics.openPositions.find((p) => p.security === asset.security)
    const holding = timeline?.holdings.find((h) => h.security === asset.security)
    const held = !!open
    // Holdings count today's shares (after splits), so the average is per share today.
    const units = holding?.units ?? open?.units ?? null
    const avgCostUsd = open && units ? open.avgCostBasisUsd / units : null

    let unrealized: number | null = held ? null : 0
    let unrealizedPct: number | null = null
    if (open && holding && timeline) {
      const marketUsd = holding.units * holding.priceUsd
      unrealized = (marketUsd - open.avgCostBasisUsd) * (usd ? 1 : timeline.usdThb)
      unrealizedPct = open.avgCostBasisUsd ? (marketUsd / open.avgCostBasisUsd - 1) * 100 : null
    }
    const realized = usd ? asset.realizedPnlUsd : asset.realizedPnlThb
    const bought = usd ? asset.boughtUsd : asset.boughtThb
    const total = unrealized == null ? null : realized + unrealized
    const value = holding ? (usd ? holding.units * holding.priceUsd : holding.valueThb) : null

    return {
      security: asset.security,
      held,
      units,
      avgCostUsd,
      priceUsd: holding?.priceUsd ?? null,
      value: held ? value : 0,
      unrealized,
      unrealizedPct,
      realized,
      total,
      totalPct: total != null && bought ? (total / bought) * 100 : null,
      approximated: holding?.approximated ?? false,
      history: analytics.ledger.filter((e) => e.security === asset.security),
    }
  })
}

/** Sum of one column, or null if any row is still unknown. */
export function sumAssets(rows: AssetPnl[], pick: (row: AssetPnl) => number | null): number | null {
  let total = 0
  for (const row of rows) {
    const value = pick(row)
    if (value == null) return null
    total += value
  }
  return total
}

export type Breakdown = { total: number; realized: number; unrealized: number; buyFees: number; fx: number }

/**
 * The total gain split into the summary's rows, each rounded as it's shown
 * (whole baht, or cents) so the rows add up to the total on screen too. The
 * USD/THB part takes the rounding; in USD there's none, so the buy fees do.
 */
export function pnlBreakdown(
  total: number,
  realized: number,
  unrealized: number,
  buyFees: number,
  currency: Currency,
): Breakdown {
  const scale = currency === '$' ? 100 : 1
  const round = (value: number) => Math.round(value * scale) / scale
  const shown = { total: round(total), realized: round(realized), unrealized: round(unrealized) }
  const rest = round(shown.total - shown.realized - shown.unrealized)
  if (currency === '$') return { ...shown, buyFees: rest, fx: 0 }
  const fees = round(buyFees)
  return { ...shown, buyFees: fees, fx: round(rest - fees) }
}
