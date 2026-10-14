import { describe, expect, it } from 'vitest'

import {
  computeDream,
  decisionOutcomes,
  firstSessionAfter,
  lastClosedSession,
  THEME_ETFS,
  type DreamLedger,
  type DreamOrder,
} from './dream'
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

  it('measures the fill against the last close the team saw at the meeting', () => {
    const state = computeDream(
      ledger([order({ ticker: 'NVDA', side: 'buy', session: '2026-10-14', reportDate: '2026-10-14', usd: 1000 })]),
      spy,
      prices,
      '2026-10-16',
      '2026-10-15',
    )
    // The meeting on the 14th saw the 13th's close (55); it filled at the 14th's close (60).
    expect(state.fills[0]).toMatchObject({ refDate: '2026-10-13', refPrice: 55 })
    expect(state.fills[0].slipPct).toBeCloseTo((60 / 55 - 1) * 100)
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

describe('integrity', () => {
  const prices = new Map([['NVDA', series('NVDA', [50, 55, 60, 66], 70)]])

  it('moves an order committed after its session opened to the next session', () => {
    const buy = order({ ticker: 'NVDA', side: 'buy', session: '2026-10-13', usd: 1000 })
    // 10:00 in New York on the 13th: the 13th's session had already opened.
    const late = computeDream(ledger([buy]), spy, prices, '2026-10-16', '2026-10-15', {
      postmarks: { [buy.id]: { at: '2026-10-13T14:00:00Z' } },
    })
    expect(late.fills[0]).toMatchObject({
      late: true,
      effectiveSession: '2026-10-14',
      fillDate: '2026-10-14',
      price: 60,
    })
    expect(late.fills[0].note).toMatch(/เลื่อน/)
    // 9:00 in New York: still before the open, so it fills as planned.
    const onTime = computeDream(ledger([buy]), spy, prices, '2026-10-16', '2026-10-15', {
      postmarks: { [buy.id]: { at: '2026-10-13T13:00:00Z' } },
    })
    expect(onTime.fills[0]).toMatchObject({ effectiveSession: '2026-10-13', fillDate: '2026-10-13', price: 55 })
    expect(onTime.fills[0].late).toBeUndefined()
  })

  it('knows when the New York session opens', () => {
    expect(firstSessionAfter(new Date('2026-10-19T11:00:00Z'))).toBe('2026-10-19') // Monday 18:00 Bangkok
    expect(firstSessionAfter(new Date('2026-10-19T13:30:00Z'))).toBe('2026-10-20') // 9:30 New York (EDT)
    expect(firstSessionAfter(new Date('2026-12-07T14:29:00Z'))).toBe('2026-12-07') // 9:29 New York (EST)
  })

  it('pays dividends after tax into cash, and reinvests them in the benchmarks', () => {
    const withDiv = (symbol: string, closes: number[], div: [string, number][]) =>
      new PriceSeries(
        symbol,
        [['2026-10-09', closes[0]], ...days.map((d, i): [string, number] => [d, closes[i]])],
        closes.at(-1)!,
        [],
        null,
        div,
      )
    const flat = [100, 100, 100, 100]
    const spyDiv = withDiv('SPY', flat, [['2026-10-14', 2]])
    const stock = new Map([
      [
        'KO',
        withDiv(
          'KO',
          [50, 50, 50, 50],
          [
            ['2026-10-14', 1],
            ['2026-10-12', 9],
          ],
        ),
      ],
    ])
    const state = computeDream(
      ledger([order({ ticker: 'KO', side: 'buy', session: '2026-10-12', usd: 5000 })]),
      spyDiv,
      stock,
      '2026-10-15',
      '2026-10-15',
    )
    // 100 shares bought at the 12th's close: no dividend that day (ex-date before we held), $1 a share on the 14th, 15% tax.
    expect(state.dividendsUsd).toBeCloseTo(100 * 1 * 0.85)
    expect(state.cashUsd).toBeCloseTo(10_000 - 5000 * 1.001605 + 85)
    // SPY: 100 units at 100, $2 a share after tax buys 1.7 more units at 100.
    expect(state.spyReturnPct).toBeCloseTo(1.7)
  })

  it('tracks an equal-weight basket of the four theme ETFs', () => {
    const themes = new Map(
      Object.values(THEME_ETFS).map((t, i) => [t, series(t, i === 0 ? [10, 10, 20, 20] : [10, 10, 10, 10])]),
    )
    const state = computeDream(ledger([]), spy, new Map(), '2026-10-15', '2026-10-15', { themes })
    // A quarter of the cash doubled: +25%.
    expect(state.themeReturnPct).toBeCloseTo(25)
    expect(computeDream(ledger([]), spy, new Map(), '2026-10-15', '2026-10-15').themeReturnPct).toBeNull()
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

describe('decisionOutcomes', () => {
  const nvda = series('NVDA', [50, 55, 60, 66], 70)
  it("measures each decision from its session's close against SPY", () => {
    const [buy, watch] = decisionOutcomes(
      [
        { reportDate: '2026-10-12', session: '2026-10-12', ticker: 'NVDA', action: 'buy' },
        { reportDate: '2026-10-12', session: '2026-10-11', ticker: 'NVDA', action: 'watch' },
      ],
      spy,
      new Map([['NVDA', nvda]]),
      '2026-10-14',
    )
    // 50 -> 60 while SPY went 100 -> 110: +20% vs +10%.
    expect(buy).toMatchObject({ fromDate: '2026-10-12', toDate: '2026-10-14', sessions: 2 })
    expect(buy.returnPct).toBeCloseTo(20)
    expect(buy.vsSpyPct).toBeCloseTo(10)
    // A weekend session date counts from the next session.
    expect(watch.fromDate).toBe('2026-10-12')
  })

  it('skips decisions whose session has not closed, or without prices', () => {
    expect(
      decisionOutcomes(
        [
          { reportDate: '2026-10-15', session: '2026-10-15', ticker: 'NVDA', action: 'buy' },
          { reportDate: '2026-10-12', session: '2026-10-12', ticker: 'GONE', action: 'watch' },
        ],
        spy,
        new Map([['NVDA', nvda]]),
        '2026-10-14',
      ),
    ).toEqual([])
  })
})
