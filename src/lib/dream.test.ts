import { describe, expect, it } from 'vitest'

import { computeDream, lastClosedSession, type DreamLedger, type DreamOrder } from './dream'
import { PriceSeries } from './prices'

const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']
const series = (symbol: string, closes: number[], latest = closes.at(-1)!) =>
  new PriceSeries(symbol, [['2026-10-09', closes[0]], ...days.map((d, i): [string, number] => [d, closes[i]])], latest)

const spy = series('SPY', [100, 100, 110, 110], 121)
const order = (o: Partial<DreamOrder> & Pick<DreamOrder, 'ticker' | 'side' | 'session'>): DreamOrder => ({
  id: `${o.session}-${o.ticker}-${o.side}`,
  reportDate: o.session,
  reason: 'test',
  ...o,
})
const ledger = (orders: DreamOrder[]): DreamLedger => ({
  startDate: '2026-10-12',
  startingCashUsd: 10_000,
  commissionPct: 0.1605,
  orders,
})

describe('computeDream', () => {
  const prices = new Map([['NVDA', series('NVDA', [50, 55, 60, 66], 70)]])

  it('fills a buy at the close of its session, commission on top', () => {
    const state = computeDream(
      ledger([order({ ticker: 'NVDA', side: 'buy', session: '2026-10-12', usd: 5000 })]),
      spy,
      prices,
      '2026-10-16',
      '2026-10-15',
    )
    const [fill] = state.fills
    expect(fill).toMatchObject({ status: 'filled', fillDate: '2026-10-12', price: 50, units: 100 })
    expect(fill.cashUsd).toBeCloseTo(-5000 * 1.001605)
    expect(state.cashUsd).toBeCloseTo(10_000 - 5000 * 1.001605)
    // Starts from the cash the day before; today at the latest prices.
    expect(state.points.map((p) => p.date)).toEqual(['2026-10-09', ...days, '2026-10-16'])
    expect(state.points.at(-1)!.value).toBeCloseTo(state.cashUsd + 100 * 70)
    expect(state.holdings[0]).toMatchObject({ ticker: 'NVDA', units: 100, avgCostUsd: 50, priceUsd: 70 })
    // SPY bought at the first close (100), now 121.
    expect(state.spyReturnPct).toBeCloseTo(21)
  })

  it('leaves an order pending until its session has closed', () => {
    const state = computeDream(
      ledger([order({ ticker: 'NVDA', side: 'buy', session: '2026-10-15', usd: 1000 })]),
      spy,
      prices,
      '2026-10-15',
      '2026-10-14',
    )
    expect(state.fills[0].status).toBe('pending')
    expect(state.valueUsd).toBe(10_000)
  })

  it('sells a share of the holding and keeps the average cost', () => {
    const state = computeDream(
      ledger([
        order({ ticker: 'NVDA', side: 'buy', session: '2026-10-12', usd: 5000 }),
        order({ ticker: 'NVDA', side: 'sell', session: '2026-10-14', fraction: 0.25 }),
      ]),
      spy,
      prices,
      '2026-10-15',
      '2026-10-15',
    )
    const sell = state.fills[1]
    expect(sell).toMatchObject({ status: 'filled', price: 60, units: 25 })
    expect(sell.cashUsd).toBeCloseTo(1500 * (1 - 0.001605))
    expect(state.holdings[0]).toMatchObject({ units: 75, avgCostUsd: 50, priceUsd: 66 })
    // A closed session today: valued at its close, not the latest quote.
    expect(state.valueUsd).toBeCloseTo(state.cashUsd + 75 * 66)
  })

  it('sells before buying on the same day, and never spends more than the cash', () => {
    const state = computeDream(
      ledger([
        order({ ticker: 'NVDA', side: 'buy', session: '2026-10-12', usd: 9000 }),
        order({ ticker: 'AAPL', side: 'buy', session: '2026-10-13', usd: 5000 }),
        order({ ticker: 'NVDA', side: 'sell', session: '2026-10-13', fraction: 1 }),
      ]),
      spy,
      new Map([...prices, ['AAPL', series('AAPL', [10, 10, 10, 10])]]),
      '2026-10-15',
      '2026-10-15',
    )
    expect(state.fills.map((f) => f.status)).toEqual(['filled', 'filled', 'filled'])
    expect(state.holdings.map((h) => h.ticker)).toEqual(['AAPL'])
    expect(state.cashUsd).toBeGreaterThan(0)
  })

  it('buys only what the cash allows, and rejects what it cannot do', () => {
    const state = computeDream(
      ledger([
        order({ ticker: 'NVDA', side: 'buy', session: '2026-10-12', usd: 20_000 }),
        order({ ticker: 'TSLA', side: 'sell', session: '2026-10-12', fraction: 1 }),
        order({ ticker: 'GONE', side: 'buy', session: '2026-10-12', usd: 100 }),
      ]),
      spy,
      new Map([...prices, ['GONE', null]]),
      '2026-10-15',
      '2026-10-15',
    )
    const byTicker = Object.fromEntries(state.fills.map((f) => [f.ticker, f]))
    expect(byTicker.NVDA).toMatchObject({ status: 'filled', note: 'ซื้อได้เท่าที่เงินสดเหลือ' })
    expect(state.cashUsd).toBeCloseTo(0, 6)
    expect(byTicker.TSLA.status).toBe('rejected')
    expect(byTicker.GONE.status).toBe('rejected')
    expect(state.missing).toEqual(['GONE', 'TSLA'])
  })

  it('fills an order for a market holiday at the next session', () => {
    const state = computeDream(
      ledger([order({ ticker: 'NVDA', side: 'buy', session: '2026-10-11', usd: 1000 })]),
      spy,
      prices,
      '2026-10-15',
      '2026-10-15',
    )
    expect(state.fills[0]).toMatchObject({ status: 'filled', fillDate: '2026-10-12' })
  })
})

describe('lastClosedSession', () => {
  it('is today in New York after the close, otherwise yesterday', () => {
    // 22:30 Bangkok = 11:30 New York (EDT): the session is still open.
    expect(lastClosedSession(new Date('2026-10-13T15:30:00Z'))).toBe('2026-10-12')
    // 04:30 Bangkok next day = 17:30 New York: closed.
    expect(lastClosedSession(new Date('2026-10-13T21:30:00Z'))).toBe('2026-10-13')
  })
})
