/**
 * Profit and loss per security, the way the Dime! app shows it.
 *
 * Unrealized P&L follows Dime!: (price - average cost) x units in USD,
 * converted at today's USD/THB rate, with the average cost excluding fees.
 * So it's the stock's own move; a change in the exchange rate since you
 * bought isn't counted as profit. Realized P&L is the actual baht from FIFO
 * (analytics.ts).
 */
import type { Analytics } from '@/lib/analytics'
import type { Timeline } from '@/lib/benchmark'

export type AssetPnl = {
  security: string
  held: boolean
  /** Null while prices load (or if they failed) for a held asset. */
  units: number | null
  avgCostUsd: number | null
  priceUsd: number | null
  valueThb: number | null
  unrealizedThb: number | null
  /** Price vs average cost, %. */
  unrealizedPct: number | null
  realizedThb: number
  totalThb: number | null
  /** Total P&L as % of everything ever spent buying it. */
  totalPct: number | null
  approximated: boolean
}

export function computeAssetPnl(analytics: Analytics, timeline: Timeline | null): AssetPnl[] {
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
      unrealized = (marketUsd - open.avgCostBasisUsd) * timeline.usdThb
      unrealizedPct = open.avgCostBasisUsd ? (marketUsd / open.avgCostBasisUsd - 1) * 100 : null
    }
    const total = unrealized == null ? null : asset.realizedPnlThb + unrealized

    return {
      security: asset.security,
      held,
      units,
      avgCostUsd,
      priceUsd: holding?.priceUsd ?? null,
      valueThb: held ? (holding?.valueThb ?? null) : 0,
      unrealizedThb: unrealized,
      unrealizedPct,
      realizedThb: asset.realizedPnlThb,
      totalThb: total,
      totalPct: total != null && asset.boughtThb ? (total / asset.boughtThb) * 100 : null,
      approximated: holding?.approximated ?? false,
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
