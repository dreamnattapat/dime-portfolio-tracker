import { describe, expect, it } from 'vitest'

import { computeAnalytics, computeTradeStats, type ClosedTrade } from './analytics'
import type { Transaction } from './db'

let nextOrderId = 1

/** A trade with no SEC/TAF fees unless `fees` is set, so most tests check the cost maths alone. */
function tx(
  date: string,
  type: 'Buy' | 'Sell',
  security: string,
  units: number,
  totalAmountThb: number,
  fees = false,
): Transaction {
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
    secFeePct: fees ? 0.00206 : 0,
    tafPerShareUsd: fees ? 0.000195 : 0,
  }
}

describe('computeAnalytics', () => {
  it('costs a sell at the average cost, as the Dime! app does', () => {
    const result = computeAnalytics([
      tx('2026-01-02', 'Buy', 'AAPL', 10, 1000), // 100/unit
      tx('2026-02-02', 'Buy', 'AAPL', 10, 2000), // 200/unit: average 150
      tx('2026-03-02', 'Sell', 'AAPL', 15, 3000), // cost 15 x 150 = 2250
    ])
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].pnlThb).toBeCloseTo(750)
    expect(result.trades[0].pnlUsd).toBeCloseTo(750 / 33)
    expect(result.realizedPnlThb).toBeCloseTo(750)
    // Selling doesn't change the average: 5 units left at 150.
    expect(result.openPositions).toEqual([{ security: 'AAPL', units: 5, avgCostBasisUsd: expect.closeTo(750 / 33) }])
    expect(result.assets).toEqual([
      {
        security: 'AAPL',
        boughtThb: 3000,
        boughtUsd: expect.closeTo(3000 / 33),
        realizedPnlThb: expect.closeTo(750),
        realizedPnlUsd: expect.closeTo(750 / 33),
      },
    ])
  })

  it("adds up each sale's P&L to the asset's realized", () => {
    const result = computeAnalytics([
      tx('2026-01-02', 'Buy', 'AAPL', 10, 1000),
      tx('2026-02-02', 'Sell', 'AAPL', 4, 600),
      tx('2026-03-02', 'Sell', 'AAPL', 6, 500),
    ])
    const sells = result.ledger.filter((e) => e.kind === 'Sell')
    expect(sells.map((e) => e.pnlThb)).toEqual([expect.closeTo(200), expect.closeTo(-100)])
    expect(sells.reduce((sum, e) => sum + e.pnlThb!, 0)).toBeCloseTo(result.assets[0].realizedPnlThb)
    expect(result.ledger.at(-1)).toMatchObject({ unitsHeld: 0, avgCostUsd: null })
  })

  it('resets the average after selling out', () => {
    const result = computeAnalytics([
      tx('2026-01-02', 'Buy', 'AAPL', 10, 1000),
      tx('2026-02-02', 'Sell', 'AAPL', 10, 1200),
      tx('2026-03-02', 'Buy', 'AAPL', 10, 3000),
      tx('2026-04-02', 'Sell', 'AAPL', 5, 2000), // cost 5 x 300, not mixed with the first 100/unit
    ])
    expect(result.trades.map((t) => t.pnlThb)).toEqual([expect.closeTo(500), expect.closeTo(200)])
    expect(result.openPositions[0]).toMatchObject({ units: 5, avgCostBasisUsd: expect.closeTo(1500 / 33) })
  })

  it('keeps buy fees out of the average and adds them up separately', () => {
    const buy = {
      ...tx('2026-01-02', 'Buy', 'AAPL', 10, 1000),
      unitPrice: 3,
      grossAmount: 30,
      totalAmount: 30.3,
      grossAmountThb: 990,
      totalAmountThb: 1000,
    } as Transaction
    const result = computeAnalytics([buy])
    expect(result.openPositions[0].avgCostBasisUsd).toBeCloseTo(30)
    expect(result.buyFeesUsd).toBeCloseTo(0.3)
    expect(result.buyFeesThb).toBeCloseTo(10)
  })

  it("counts units in today's shares after a split, like the Dime! app", () => {
    const splits = { NVDA: [['2026-02-16', 4]] as [string, number][] }
    const result = computeAnalytics(
      [
        tx('2026-01-02', 'Buy', 'NVDA', 2, 26_400), // 2 at $400 = 8 of today's shares at $100
        tx('2026-03-02', 'Buy', 'NVDA', 4, 13_200), // 4 at $100
        tx('2026-04-01', 'Sell', 'NVDA', 6, 23_760), // 6 of 12 at $120
      ],
      splits,
    )
    expect(result.openPositions).toEqual([{ security: 'NVDA', units: 6, avgCostBasisUsd: expect.closeTo(600) }])
    expect(result.trades[0]).toMatchObject({ units: 6, basisComplete: true, pnlUsd: expect.closeTo(120) })
    // The history: the split shows up between the trades, in shares of each day.
    expect(
      result.ledger.map((e) => [e.kind, e.unitsHeld, e.avgCostUsd && Math.round(e.avgCostUsd * 100) / 100, e.pnlUsd]),
    ).toEqual([
      ['Buy', 2, 400, null],
      ['Split', 8, 100, null],
      ['Buy', 12, 100, null],
      ['Sell', 6, 100, expect.closeTo(120)],
    ])
  })

  it('sorts by date, not by the order rows are stored in', () => {
    const sell = tx('2026-03-02', 'Sell', 'AAPL', 10, 1500)
    const buy = tx('2026-01-02', 'Buy', 'AAPL', 10, 1000)
    const result = computeAnalytics([sell, buy])
    expect(result.trades[0].pnlThb).toBeCloseTo(500)
    expect(result.cashFlows.map((f) => f.thb)).toEqual([-1000, 1500])
  })

  it("deducts the SEC and TAF fees from a sell's proceeds", () => {
    const result = computeAnalytics([
      tx('2026-01-02', 'Buy', 'AAPL', 10, 1000, true),
      tx('2026-03-02', 'Sell', 'AAPL', 10, 1500, true), // 45.45 USD: SEC 0.01 + TAF 0.01 = 0.02 USD = 0.66 THB
    ])
    expect(result.trades[0].pnlUsd).toBeCloseTo(500 / 33 - 0.02)
    expect(result.trades[0].pnlThb).toBeCloseTo(result.trades[0].pnlUsd * 33)
    expect(result.cashFlows[1].usd).toBeCloseTo(1500 / 33 - 0.02, 2)
  })

  it('measures only the units with a buy on record, and flags the sale', () => {
    const result = computeAnalytics([
      tx('2026-01-02', 'Buy', 'MSFT', 1, 300),
      tx('2026-02-02', 'Sell', 'MSFT', 3, 1500), // 2 of the 3 units have no buy on record: unknown cost
    ])
    // The 1 unit on record: 500 of proceeds against its cost of 300. The other 2 units count as nothing.
    expect(result.trades[0]).toMatchObject({
      basisComplete: false,
      recordedShare: expect.closeTo(1 / 3),
      pnlThb: expect.closeTo(200),
    })
    expect(result.incompleteBasisTrades).toBe(1)
    expect(result.openPositions).toEqual([])
    expect(result.realizedPnlThb).toBeCloseTo(200)
  })

  it('does not count a sale with no buy on record at all, nor rate it a win or loss', () => {
    const result = computeAnalytics([tx('2026-02-02', 'Sell', 'UNH', 4, 52_000)])
    expect(result.trades[0]).toMatchObject({ recordedShare: 0, pnlThb: 0, pnlUsd: 0 })
    expect(result.realizedPnlThb).toBe(0)
    expect(result.stats.rated).toBe(0)
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
  const trade = (pnlUsd: number) => ({ pnlUsd, win: pnlUsd > 0 }) as ClosedTrade

  it('counts the share of trades that made money', () => {
    const stats = computeTradeStats([trade(100), trade(100), trade(100), trade(100), trade(-1000)])
    expect(stats).toEqual({ rated: 5, wins: 4, losses: 1, winRatePct: 80 })
  })

  it('has no win rate without trades', () => {
    expect(computeTradeStats([]).winRatePct).toBeNull()
  })
})
