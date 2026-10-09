/**
 * Realized profit/loss, win rate and trade-size stats from the stored
 * transactions. Ported from dime-auto-log-transactions/src/analytics.py.
 *
 * Cost basis is tracked per security using FIFO: each Buy (or Reward /
 * Exercise, which also add units) pushes a lot onto that security's queue;
 * each Sell consumes lots oldest-first, and net proceeds minus matched cost is
 * that trade's realized P&L. Everything is in THB, using each row's
 * `totalAmountThb` (already net of VAT/withholding): the account's actual cash.
 *
 * Realized only. Valuing open positions needs market prices; see benchmark.ts.
 */
import type { Transaction } from '@/lib/db'
import type { ParsedTransaction } from '@/lib/dime/parser'

// Smallest fraction of a unit treated as real rather than float residue. Units
// have up to 7 decimals, so this clears rounding from repeated FIFO subtraction.
export const EPS = 1e-4

// Cash-parking ETFs left out of the win rate and trade-size stats. Their
// return is almost all dividends (not tracked), so every sell looks like a
// small fee/FX loss. They still count toward realized P&L.
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
  proceedsThb: number
  costThb: number
  pnlThb: number
  pnlPct: number | null
  win: boolean
  /** False when more was sold than bought on record (e.g. bought before the Gmail history). */
  basisComplete: boolean
}

export type OpenPosition = {
  security: string
  units: number
  /** FIFO cost of the units held, including fees. */
  costBasisThb: number
  /**
   * Cost of the units held as Dime! shows it: average purchase price
   * (excluding fees) times units. Sells don't change the average; selling
   * out completely resets it.
   */
  avgCostBasisUsd: number
}

/** Lifetime totals for one security, open or closed. */
export type AssetTotals = {
  security: string
  /** Everything ever spent buying it. */
  boughtThb: number
  realizedPnlThb: number
}

/** Why a high win rate alone doesn't mean the trading pays. */
export type TradeStats = {
  rated: number
  wins: number
  losses: number
  winRatePct: number | null
  avgWinThb: number | null
  avgLossThb: number | null
  /** Average win / average loss. Below 1 means losers are bigger than winners. */
  payoffRatio: number | null
  /** The win rate at which wins and losses cancel out, given the payoff ratio. */
  breakEvenWinRatePct: number | null
  /** Gross profit / gross loss. Above 1 means the trading made money overall. */
  profitFactor: number | null
  /** Average P&L per closed trade. */
  expectancyThb: number | null
}

export type Analytics = {
  realizedPnlThb: number
  assets: AssetTotals[]
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

type Lot = { units: number; costPerUnit: number }

/** Dime!'s average-cost bookkeeping for one security, in USD excluding fees. */
type AverageCost = { units: number; costUsd: number }

export function computeAnalytics(transactions: Transaction[]): Analytics {
  const rows = transactions
    .filter((tx): tx is Transaction & ParsedTransaction => tx.parseStatus === 'ok')
    .sort(compareOldestFirst)

  const lots = new Map<string, Lot[]>()
  const assets = new Map<string, AssetTotals>()
  const averages = new Map<string, AverageCost>()
  const trades: ClosedTrade[] = []
  const cashFlows: CashFlow[] = []

  for (const row of rows) {
    if (row.totalAmountThb == null) continue
    const isSell = row.transactionType === 'Sell'
    cashFlows.push({
      security: row.security,
      date: tradeDate(row),
      units: isSell ? -row.units : row.units,
      unitPrice: row.unitPrice,
      thb: isSell ? row.totalAmountThb : -row.totalAmountThb,
      usd: isSell ? row.totalAmount : -row.totalAmount,
    })

    let queue = lots.get(row.security)
    if (!queue) lots.set(row.security, (queue = []))
    let asset = assets.get(row.security)
    if (!asset) assets.set(row.security, (asset = { security: row.security, boughtThb: 0, realizedPnlThb: 0 }))
    let average = averages.get(row.security)
    if (!average) averages.set(row.security, (average = { units: 0, costUsd: 0 }))

    if (!isSell) {
      // Buy, Reward, Exercise Call/Put: a new cost-basis lot.
      queue.push({ units: row.units, costPerUnit: row.units ? row.totalAmountThb / row.units : 0 })
      asset.boughtThb += row.totalAmountThb
      average.units += row.units
      average.costUsd += row.units * row.unitPrice
      continue
    }

    let toSell = row.units
    let matchedCost = 0
    while (toSell > EPS && queue.length) {
      const lot = queue[0]
      const take = Math.min(lot.units, toSell)
      matchedCost += take * lot.costPerUnit
      toSell -= take
      if (take >= lot.units - EPS) queue.shift()
      else lot.units -= take
    }
    const pnl = row.totalAmountThb - matchedCost
    asset.realizedPnlThb += pnl
    if (average.units - row.units > EPS) {
      average.costUsd -= (average.costUsd / average.units) * row.units
      average.units -= row.units
    } else {
      averages.set(row.security, { units: 0, costUsd: 0 })
    }
    trades.push({
      date: tradeDate(row),
      security: row.security,
      units: row.units,
      proceedsThb: row.totalAmountThb,
      costThb: matchedCost,
      pnlThb: pnl,
      pnlPct: matchedCost ? (pnl / matchedCost) * 100 : null,
      win: pnl > 0,
      basisComplete: toSell <= EPS,
    })
  }

  const openPositions: OpenPosition[] = []
  for (const [security, queue] of lots) {
    const units = queue.reduce((sum, lot) => sum + lot.units, 0)
    if (units > EPS) {
      const costBasisThb = queue.reduce((sum, lot) => sum + lot.units * lot.costPerUnit, 0)
      const avgCostBasisUsd = averages.get(security)?.costUsd ?? 0
      openPositions.push({ security, units, costBasisThb, avgCostBasisUsd })
    }
  }
  openPositions.sort((a, b) => a.security.localeCompare(b.security))

  return {
    realizedPnlThb: trades.reduce((sum, t) => sum + t.pnlThb, 0),
    assets: [...assets.values()],
    trades: trades.reverse(), // newest first
    openPositions,
    cashFlows,
    stats: computeTradeStats(trades.filter((t) => !WIN_RATE_EXCLUDED.has(t.security))),
    incompleteBasisTrades: trades.filter((t) => !t.basisComplete).length,
  }
}

export function computeTradeStats(trades: ClosedTrade[]): TradeStats {
  const wins = trades.filter((t) => t.win)
  const losses = trades.filter((t) => !t.win)
  const grossProfit = wins.reduce((sum, t) => sum + t.pnlThb, 0)
  const grossLoss = -losses.reduce((sum, t) => sum + t.pnlThb, 0)
  const avgWin = wins.length ? grossProfit / wins.length : null
  const avgLoss = losses.length ? grossLoss / losses.length : null
  const payoffRatio = avgWin != null && avgLoss ? avgWin / avgLoss : null

  return {
    rated: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : null,
    avgWinThb: avgWin,
    avgLossThb: avgLoss,
    payoffRatio,
    // Break even when winRate * avgWin = (1 - winRate) * avgLoss.
    breakEvenWinRatePct: payoffRatio != null ? 100 / (1 + payoffRatio) : null,
    profitFactor: grossLoss ? grossProfit / grossLoss : null,
    expectancyThb: trades.length ? (grossProfit - grossLoss) / trades.length : null,
  }
}
