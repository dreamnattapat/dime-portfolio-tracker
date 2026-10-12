/**
 * Realized profit/loss, cost basis and win rate from the stored transactions.
 *
 * Cost basis follows the Dime! app: an average cost per security in USD,
 * excluding fees (the app's "ต้นทุนเฉลี่ย"). A Buy (or Reward / Exercise, which
 * also add units) adds units x price to it; a Sell takes the average cost of
 * the units sold off it and leaves the average unchanged; selling out resets
 * it. A sell's realized P&L is what reached the account (after commission,
 * VAT and the SEC/TAF fees deducted later, see fees.ts) minus that cost.
 *
 * Using one method for both realized and unrealized (assets.ts) is what lets
 * the dashboard's numbers add up: realized + unrealized + buy fees (which
 * average cost leaves out) = the portfolio's actual gain in USD; in baht, the
 * rest is the USD/THB move.
 *
 * In baht, P&L is the USD figure at the rate of the day it happened (the
 * confirmation's rate for a sell), so it reflects the stock, not the currency.
 */
import type { Transaction } from '@/lib/db'
import { netAmounts } from '@/lib/dime/fees'
import type { ParsedTransaction } from '@/lib/dime/parser'
import { splitFactorAfter, type Split } from '@/lib/prices'

// Smallest fraction of a unit treated as real rather than float residue. Units
// have up to 7 decimals, so this clears rounding from repeated subtraction.
export const EPS = 1e-4

// Cash-parking ETFs left out of the win rate. Their return is almost all
// dividends (not tracked), so every sell looks like a small fee loss. They
// still count toward realized P&L.
export const WIN_RATE_EXCLUDED = new Set(['SGOV'])

/** Money in or out of the market, from the investor's side: buys negative, sells positive. */
export type CashFlow = {
  security: string
  /** ISO YYYY-MM-DD */
  date: string
  /** Signed: + bought, - sold. */
  units: number
  unitPrice: number
  thb: number
  usd: number
}

export type ClosedTrade = {
  date: string
  security: string
  units: number
  /** Net proceeds minus the average cost of the units sold. */
  pnlUsd: number
  /** The same at the sale's exchange rate. */
  pnlThb: number
  win: boolean
  /** False when more was sold than bought on record (e.g. bought before the Gmail history). */
  basisComplete: boolean
}

export type OpenPosition = {
  security: string
  /** In today's shares, if the splits were given. */
  units: number
  /** Average cost (excluding fees) times units held, as the Dime! app counts it. */
  avgCostBasisUsd: number
}

/** Lifetime totals for one security, open or closed. */
export type AssetTotals = {
  security: string
  /** Everything ever spent buying it, fees included. */
  boughtThb: number
  boughtUsd: number
  realizedPnlThb: number
  realizedPnlUsd: number
}

export type TradeStats = {
  rated: number
  wins: number
  losses: number
  winRatePct: number | null
}

export type Analytics = {
  realizedPnlThb: number
  realizedPnlUsd: number
  /** Commission and VAT paid on every buy: part of the actual gain that average cost leaves out. */
  buyFeesUsd: number
  buyFeesThb: number
  assets: AssetTotals[]
  /** Newest first. */
  trades: ClosedTrade[]
  openPositions: OpenPosition[]
  cashFlows: CashFlow[]
  stats: TradeStats
  incompleteBasisTrades: number
}

export function tradeDate(tx: ParsedTransaction): string {
  return tx.effectiveDate ?? tx.settlementDate
}

/** Oldest first; same-day trades by Dime!'s sequential order ID. */
export function compareOldestFirst(a: ParsedTransaction, b: ParsedTransaction): number {
  return tradeDate(a).localeCompare(tradeDate(b)) || Number(a.orderId) - Number(b.orderId)
}

/** Dime!'s average-cost bookkeeping for one security, in USD excluding fees. */
type AverageCost = { units: number; costUsd: number }

/**
 * `splits` (from the price history, once loaded) converts units to today's
 * shares, as the Dime! app does after a split: 2 shares bought before a 4:1
 * split are 8 at a quarter of the cost each. Dime! sends no email for a split.
 * Cash flows stay as traded; the timeline converts them itself.
 */
export function computeAnalytics(transactions: Transaction[], splits: Record<string, Split[]> = {}): Analytics {
  const rows = transactions
    .filter((tx): tx is Transaction & ParsedTransaction => tx.parseStatus === 'ok')
    .sort(compareOldestFirst)

  const assets = new Map<string, AssetTotals>()
  const averages = new Map<string, AverageCost>()
  const trades: ClosedTrade[] = []
  const cashFlows: CashFlow[] = []
  let buyFeesUsd = 0
  let buyFeesThb = 0

  for (const row of rows) {
    if (row.totalAmountThb == null) continue
    const isSell = row.transactionType === 'Sell'
    // What actually reached the account: sells less the fees deducted after the confirmation.
    const net = netAmounts(row)
    const proceedsThb = net.thb ?? row.totalAmountThb
    cashFlows.push({
      security: row.security,
      date: tradeDate(row),
      units: isSell ? -row.units : row.units,
      unitPrice: row.unitPrice,
      thb: isSell ? proceedsThb : -row.totalAmountThb,
      usd: isSell ? net.usd : -row.totalAmount,
    })

    let asset = assets.get(row.security)
    if (!asset)
      assets.set(
        row.security,
        (asset = { security: row.security, boughtThb: 0, boughtUsd: 0, realizedPnlThb: 0, realizedPnlUsd: 0 }),
      )
    let average = averages.get(row.security)
    if (!average) averages.set(row.security, (average = { units: 0, costUsd: 0 }))

    const units = row.units * splitFactorAfter(splits[row.security], tradeDate(row))
    if (!isSell) {
      // Buy, Reward, Exercise Call/Put: more units at this price.
      const costUsd = row.units * row.unitPrice
      average.units += units
      average.costUsd += costUsd
      asset.boughtThb += row.totalAmountThb
      asset.boughtUsd += row.totalAmount
      // Whatever was paid beyond the shares' price: commission and VAT.
      buyFeesUsd += row.totalAmount - costUsd
      buyFeesThb += row.totalAmountThb - (row.grossAmountThb ?? row.totalAmountThb)
      continue
    }

    // Selling more than is on record (bought before the Gmail history) has no cost for the extra units.
    const basisComplete = units <= average.units + EPS
    const soldCostUsd = basisComplete ? (average.costUsd / average.units) * units : average.costUsd
    if (average.units - units > EPS) {
      average.costUsd -= soldCostUsd
      average.units -= units
    } else {
      average.units = 0
      average.costUsd = 0
    }
    const pnlUsd = net.usd - soldCostUsd
    // At the confirmation's rate, which its baht amounts use.
    const rate = row.fxRateThbUsd ?? (net.usd ? proceedsThb / net.usd : 0)
    const pnlThb = pnlUsd * rate
    asset.realizedPnlUsd += pnlUsd
    asset.realizedPnlThb += pnlThb
    trades.push({
      date: tradeDate(row),
      security: row.security,
      units,
      pnlUsd,
      pnlThb,
      win: pnlUsd > 0,
      basisComplete,
    })
  }

  const openPositions: OpenPosition[] = []
  for (const [security, average] of averages) {
    if (average.units > EPS) openPositions.push({ security, units: average.units, avgCostBasisUsd: average.costUsd })
  }
  openPositions.sort((a, b) => a.security.localeCompare(b.security))

  return {
    realizedPnlThb: trades.reduce((sum, t) => sum + t.pnlThb, 0),
    realizedPnlUsd: trades.reduce((sum, t) => sum + t.pnlUsd, 0),
    buyFeesUsd,
    buyFeesThb,
    assets: [...assets.values()],
    trades: trades.toReversed(),
    openPositions,
    cashFlows,
    stats: computeTradeStats(trades.filter((t) => !WIN_RATE_EXCLUDED.has(t.security))),
    incompleteBasisTrades: trades.filter((t) => !t.basisComplete).length,
  }
}

/** Share of closed trades that made money, judged in USD so it's the same in either currency. */
export function computeTradeStats(trades: ClosedTrade[]): TradeStats {
  const wins = trades.filter((t) => t.win).length
  return {
    rated: trades.length,
    wins,
    losses: trades.length - wins,
    winRatePct: trades.length ? (wins / trades.length) * 100 : null,
  }
}
