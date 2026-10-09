import { describe, expect, it } from 'vitest'

import type { CashFlow } from './analytics'
import { computeTimeline, monthsBefore, periodChange, xirr, type TimelinePoint } from './benchmark'
import { parseChart, PriceSeries } from './prices'

const days = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']
const series = (symbol: string, closes: number[], latest: number, splits: [string, number][] = []) =>
  new PriceSeries(
    symbol,
    days.map((d, i): [string, number] => [d, closes[i]]),
    latest,
    splits,
  )

// A buy of `units` for `usd` dollars, at 30 THB/USD.
const flow = (date: string, security: string, units: number, usd: number): CashFlow => ({
  security,
  date,
  units,
  unitPrice: Math.abs(usd / units),
  thb: -usd * 30,
  usd: -usd,
})

describe('xirr', () => {
  it('finds 10% for money that grew 10% in a year', () => {
    expect(
      xirr([
        ['2025-01-01', -1000],
        ['2026-01-01', 1100],
      ]),
    ).toBeCloseTo(0.1, 4)
  })

  it('returns null without a sign change', () => {
    expect(xirr([['2025-01-01', 1000]])).toBeNull()
  })
})

describe('computeTimeline', () => {
  const spy = series('SPY', [100, 100, 110, 110], 120)
  const fx = series('THB=X', [30, 30, 30, 30], 30)

  it('values holdings and the SPY mirror each day', () => {
    const prices = new Map([['AAPL', series('AAPL', [10, 12, 12, 15], 20)]])
    // Buy 10 AAPL for $100 on day 1.
    const { points } = computeTimeline([flow('2026-01-05', 'AAPL', 10, 100)], spy, fx, prices, '2026-01-09')
    expect(points.map((p) => p.date)).toEqual([...days, '2026-01-09'])
    expect(points.map((p) => p.value)).toEqual([3000, 3600, 3600, 4500, 6000])
    // $100 bought 1 SPY share.
    expect(points.map((p) => p.spy)).toEqual([3000, 3000, 3300, 3300, 3600])
    expect(points[0].invested).toBe(3000)
    expect(points[0].bought).toBe(3000)
  })

  it('keeps valuing a holding correctly after a split', () => {
    // 2:1 split on day 3; Yahoo's history is adjusted, so day 1-2 closes are halved.
    const prices = new Map([['NVDA', series('NVDA', [50, 50, 50, 50], 50, [['2026-01-07', 2]])]])
    const { points } = computeTimeline([flow('2026-01-05', 'NVDA', 1, 100)], spy, fx, prices, '2026-01-09')
    expect(points.map((p) => p.value)).toEqual([3000, 3000, 3000, 3000, 3000])
  })

  it('falls back to the last trade price for a ticker without history', () => {
    const { points, approximated } = computeTimeline(
      [flow('2026-01-05', 'GONE', 10, 100)],
      spy,
      fx,
      new Map([['GONE', null]]),
      '2026-01-09',
    )
    expect(approximated).toEqual(['GONE'])
    expect(points.at(-1)!.value).toBe(3000)
  })
})

describe('periodChange', () => {
  const point = (date: string, value: number, bought = 0, sold = 0): TimelinePoint => ({
    date,
    value,
    spy: 0,
    invested: 0,
    bought,
    sold,
  })

  it("doesn't count new money as growth", () => {
    const change = periodChange(
      [
        point('2026-01-09', 1000),
        point('2026-02-01', 1100),
        // Added 1100 on the open, ended flat: no gain that day.
        point('2026-02-02', 2200, 1100),
        point('2026-02-09', 2420),
      ],
      1,
    )!
    expect(change.gainThb).toBeCloseTo(320)
    expect(change.returnPct).toBeCloseTo(21) // 1.1 * 1.0 * 1.1
  })

  it('counts a sell-everything day by what the sale fetched', () => {
    const change = periodChange([point('2026-01-09', 1000), point('2026-02-09', 0, 0, 980)], 1)!
    expect(change.returnPct).toBeCloseTo(-2)
  })

  it('returns null when the history is shorter than the period', () => {
    expect(periodChange([point('2026-01-20', 1000), point('2026-02-09', 1100)], 1)).toBeNull()
  })
})

describe('monthsBefore', () => {
  it('clamps to the end of a shorter month', () => {
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28')
    expect(monthsBefore('2026-10-09', 12)).toBe('2025-10-09')
  })
})

describe('parseChart', () => {
  it('reads closes on the exchange date, latest price and splits', () => {
    const prices = parseChart('NVDA', {
      chart: {
        result: [
          {
            // 9:30 New York = 13:30 UTC; offset -4h keeps it on the same date.
            meta: { gmtoffset: -14400, regularMarketPrice: 130 },
            timestamp: [Date.UTC(2026, 5, 9, 13, 30) / 1000, Date.UTC(2026, 5, 10, 13, 30) / 1000],
            indicators: { quote: [{ close: [120, null] }] },
            events: { splits: { x: { date: Date.UTC(2026, 5, 10, 13, 30) / 1000, numerator: 10, denominator: 1 } } },
          },
        ],
      },
    })
    expect(prices.dates).toEqual(['2026-06-09'])
    expect(prices.latest).toBe(130)
    expect(prices.splitFactorAfter('2026-06-09')).toBe(10)
    expect(prices.splitFactorAfter('2026-06-10')).toBe(1)
  })
})
