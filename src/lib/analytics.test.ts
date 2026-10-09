import { describe, expect, it } from 'vitest'

import { computeAnalytics, computeTradeStats, type ClosedTrade } from './analytics'
import type { Transaction } from './db'

let nextOrderId = 1

function tx(date: string, type: 'Buy' | 'Sell', security: string, units: number, totalAmountThb: number): Transaction {
  const orderId = String(nextOrderId++)
  return {
    id: `msg${orderId}:0`,
    gmailMessageId: `msg${orderId}`,
    receivedAt: `${date}T10:00:00.000Z`,
    parseStatus: 'ok',
    orderId,
    settlementDate: date,
    effectiveDate: date,
    issueDate: date,
    transactionType: type,
    security,
    units,
    unitPrice: totalAmountThb / units / 33,
    currency: 'USD',
    grossAmount: totalAmountThb / 33,
    vat: 0,
    withholdingTax: 0,
    totalAmount: totalAmountThb / 33,
    exchange: 'XNAS',
    grossAmountThb: totalAmountThb,
    vatThb: 0,
    withholdingTaxThb: 0,
    totalAmountThb,
    accountNo: null,
    taxInvoiceNo: null,
    totalBuyThb: null,
    totalSellThb: null,
    totalFeeThb: null,
    totalVatThb: null,
    totalWithholdingTaxThb: null,
    fxRateThbUsd: 33,
  }
}

describe('computeAnalytics', () => {
  it('matches sells against the oldest lots first', () => {
    const result = computeAnalytics([
      tx('2026-01-02', 'Buy', 'AAPL', 10, 1000), // 100/unit
      tx('2026-02-02', 'Buy', 'AAPL', 10, 2000), // 200/unit
      tx('2026-03-02', 'Sell', 'AAPL', 15, 3000), // cost 10*100 + 5*200 = 2000
    ])
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].costThb).toBeCloseTo(2000)
    expect(result.trades[0].pnlThb).toBeCloseTo(1000)
    expect(result.realizedPnlThb).toBeCloseTo(1000)
    expect(result.openPositions).toEqual([{ security: 'AAPL', units: 5, costBasisThb: 1000 }])
  })

  it('sorts by date, not by the order rows are stored in', () => {
    const sell = tx('2026-03-02', 'Sell', 'AAPL', 10, 1500)
    const buy = tx('2026-01-02', 'Buy', 'AAPL', 10, 1000)
    const result = computeAnalytics([sell, buy])
    expect(result.trades[0].pnlThb).toBeCloseTo(500)
    expect(result.cashFlows.map((f) => f.thb)).toEqual([-1000, 1500])
  })

  it('flags a sell with no matching buy on record', () => {
    const result = computeAnalytics([tx('2026-01-02', 'Sell', 'MSFT', 1, 500)])
    expect(result.trades[0].basisComplete).toBe(false)
    expect(result.incompleteBasisTrades).toBe(1)
  })

  it('leaves cash-parking ETFs out of the win rate but not the P&L', () => {
    const result = computeAnalytics([
      tx('2026-01-02', 'Buy', 'SGOV', 10, 1000),
      tx('2026-02-02', 'Sell', 'SGOV', 10, 990),
      tx('2026-01-02', 'Buy', 'AAPL', 10, 1000),
      tx('2026-02-02', 'Sell', 'AAPL', 10, 1100),
    ])
    expect(result.realizedPnlThb).toBeCloseTo(90)
    expect(result.stats.rated).toBe(1)
    expect(result.stats.winRatePct).toBe(100)
  })
})

describe('computeTradeStats', () => {
  const trade = (pnlThb: number) => ({ pnlThb, win: pnlThb > 0 }) as ClosedTrade

  it('shows how a high win rate can still lose money', () => {
    // 4 small wins, 1 big loss: 80% win rate, but a net loss.
    const stats = computeTradeStats([trade(100), trade(100), trade(100), trade(100), trade(-1000)])
    expect(stats.winRatePct).toBe(80)
    expect(stats.avgWinThb).toBe(100)
    expect(stats.avgLossThb).toBe(1000)
    expect(stats.payoffRatio).toBeCloseTo(0.1)
    expect(stats.breakEvenWinRatePct).toBeCloseTo(90.91, 2)
    expect(stats.profitFactor).toBeCloseTo(0.4)
    expect(stats.expectancyThb).toBeCloseTo(-120)
  })

  it('returns nulls when there is nothing to compare', () => {
    const stats = computeTradeStats([trade(100)])
    expect(stats.avgLossThb).toBeNull()
    expect(stats.payoffRatio).toBeNull()
    expect(stats.breakEvenWinRatePct).toBeNull()
    expect(stats.profitFactor).toBeNull()
  })
})
