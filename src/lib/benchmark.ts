/**
 * Values the portfolio day by day and compares it with the S&P 500 (SPY).
 * Ported from dime-auto-log-transactions/src/benchmark.py.
 *
 * The S&P 500 side is a mirror portfolio: every Buy/Sell is mirrored by
 * buying/selling the same USD amount of SPY on the same day. Both portfolios
 * have identical cash in and out, so comparing their values answers "did my
 * picks beat just holding the index?". Both are valued at each day's close and
 * USD/THB rate; the mirror pays no fees, and dividends are left out on both
 * sides.
 *
 * Unlike the Python version, units are converted to today's split-adjusted
 * shares, so a holding that went through a split (which Dime! sends no email
 * for) is still valued correctly after it.
 */
import { EPS, type CashFlow } from '@/lib/analytics'
import { fetchPrices, PriceSeries, yahooSymbol } from '@/lib/prices'

export const BENCHMARK_SYMBOL = 'SPY'
const FX_SYMBOL = 'THB=X' // THB per 1 USD

/** One day, with every amount in one currency (THB or USD, see Timeline). */
export type TimelinePoint = {
  /** ISO YYYY-MM-DD */
  date: string
  /** Market value of the holdings. */
  value: number
  /** Market value of the SPY mirror. */
  spy: number
  /** Money put in minus money taken out so far. */
  invested: number
  /** Cash spent on buys this day. */
  bought: number
  /** Cash received from sells this day. */
  sold: number
}

/** One security held today. */
export type Holding = {
  security: string
  /** In today's shares, i.e. after any splits. */
  units: number
  priceUsd: number
  valueThb: number
  /** No market price, so valued at the last trade price. */
  approximated: boolean
}

export type Timeline = {
  /** In THB, at each day's USD/THB rate: what the account is worth in baht. */
  points: TimelinePoint[]
  /** In USD: the stocks' own performance, without currency moves (as TradingView shows it). */
  pointsUsd: TimelinePoint[]
  /** What's held on the last day, valued at the latest prices. */
  holdings: Holding[]
  /** The latest USD/THB rate. */
  usdThb: number
  /** Securities with no market history (e.g. delisted), valued at their last trade price. */
  approximated: string[]
  /** The most recent US trading day with a price, ISO date (it can be today's, still trading). */
  latestSession: string
}

/** Holdings, SPY mirror and net invested on every trading day from the first trade to today. */
export function computeTimeline(
  flows: CashFlow[],
  spy: PriceSeries,
  fx: PriceSeries,
  prices: Map<string, PriceSeries | null>,
  today: string,
): Timeline {
  if (!flows.length) {
    return { points: [], pointsUsd: [], holdings: [], usdThb: fx.latest, approximated: [], latestSession: '' }
  }
  const days = [...spy.dates.filter((d) => d >= flows[0].date && d < today), today]

  // Units in today's split-adjusted shares, so they pair with adjusted closes.
  const units = new Map<string, number>()
  const lastTradePrice = new Map<string, number>()
  const approximated = new Set<string>()
  let cashThb = 0
  let cashUsd = 0
  let spyShares = 0
  let i = 0
  const points: TimelinePoint[] = []
  const pointsUsd: TimelinePoint[] = []
  const holdings: Holding[] = []

  for (const day of days) {
    let bought = 0
    let sold = 0
    let boughtUsd = 0
    let soldUsd = 0
    for (; i < flows.length && flows[i].date <= day; i++) {
      const f = flows[i]
      const factor = prices.get(f.security)?.splitFactorAfter(f.date) ?? 1
      units.set(f.security, (units.get(f.security) ?? 0) + f.units * factor)
      if (f.unitPrice) lastTradePrice.set(f.security, f.unitPrice / factor)
      cashThb += f.thb
      cashUsd += f.usd
      if (f.thb < 0) bought -= f.thb
      else sold += f.thb
      if (f.usd < 0) boughtUsd -= f.usd
      else soldUsd += f.usd
      spyShares += -f.usd / spy.on(f.date)
    }

    const isToday = day === today
    const usdThb = isToday ? fx.latest : fx.on(day)
    let holdingsUsd = 0
    for (const [security, held] of units) {
      if (Math.abs(held) < EPS) continue
      const series = prices.get(security)
      let price: number
      let approx = false
      try {
        if (!series) throw new RangeError(`no history for ${security}`)
        price = isToday ? series.latest : series.on(day)
      } catch {
        price = lastTradePrice.get(security) ?? 0
        approximated.add(security)
        approx = true
      }
      holdingsUsd += held * price
      if (isToday) {
        holdings.push({ security, units: held, priceUsd: price, valueThb: held * price * usdThb, approximated: approx })
      }
    }

    const spyUsd = spyShares * (isToday ? spy.latest : spy.on(day))
    points.push({ date: day, value: holdingsUsd * usdThb, spy: spyUsd * usdThb, invested: -cashThb, bought, sold })
    pointsUsd.push({
      date: day,
      value: holdingsUsd,
      spy: spyUsd,
      invested: -cashUsd,
      bought: boughtUsd,
      sold: soldUsd,
    })
  }
  holdings.sort((a, b) => b.valueThb - a.valueThb)
  return {
    points,
    pointsUsd,
    holdings,
    usdThb: fx.latest,
    approximated: [...approximated].sort(),
    latestSession: spy.dates.at(-1)!,
  }
}

/** ISO date `months` months before `iso`, clamped to the month's last day (31 Mar -> 28/29 Feb). */
export function monthsBefore(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 - months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

export type PeriodChange = {
  /** Change in value not explained by money put in or taken out, in the points' currency. */
  gain: number
  /** Time-weighted return: ignores when and how much money was added. */
  returnPct: number
}

/**
 * How the portfolio did over the last `months` months, or null if the history
 * is shorter than that.
 */
export function periodChange(points: TimelinePoint[], months: number): PeriodChange | null {
  if (!points.length) return null
  const from = monthsBefore(points.at(-1)!.date, months)
  return changeBetween(
    points,
    points.findLastIndex((p) => p.date <= from),
  )
}

/**
 * The latest US trading day's move: from the close before `latestSession` to
 * now. In Thailand's morning the US market has closed, so "today" is still
 * last night's session, as in the Dime! app.
 */
export function dayChange(points: TimelinePoint[], latestSession: string): PeriodChange | null {
  return changeBetween(
    points,
    points.findLastIndex((p) => p.date < latestSession),
  )
}

/**
 * Change from points[start] to points[end] (default: the last). Uses the
 * time-weighted return, as brokers do, so adding money doesn't count as
 * growth: each day's return is end value plus sells over start value plus buys
 * (buys at the open, sells at the close). `valueOf` picks the series: your
 * holdings by default, or the S&P 500 mirror, which has the same cash flows.
 */
export function changeBetween(
  points: TimelinePoint[],
  start: number,
  end = points.length - 1,
  valueOf: (p: TimelinePoint) => number = (p) => p.value,
): PeriodChange | null {
  if (start < 0 || start >= end) return null
  let growth = 1
  let gain = 0
  for (let j = start + 1; j <= end; j++) {
    const prev = valueOf(points[j - 1])
    const p = points[j]
    const value = valueOf(p)
    gain += value - prev - p.bought + p.sold
    const base = prev + p.bought
    if (base > 1) growth *= (value + p.sold) / base // skip days fully in cash
  }
  return { gain, returnPct: (growth - 1) * 100 }
}

/**
 * Index where a range of `months` ending at the last point starts, 0 for the
 * whole history (null months), or -1 if the history is shorter than that.
 */
export function rangeStart(points: TimelinePoint[], months: number | null): number {
  if (months == null || !points.length) return 0
  const from = monthsBefore(points.at(-1)!.date, months)
  return points.findLastIndex((p) => p.date <= from)
}

export type Scorecard = {
  /** Your time-weighted return over the range, %. */
  youPct: number
  /** The S&P 500 mirror's, %. */
  spyPct: number
  /** youPct - spyPct: positive means you're ahead. */
  leadPct: number
}

/** Am I beating the S&P 500 over the last `months` (null = all history)? Null if too little history. */
export function scorecard(points: TimelinePoint[], months: number | null): Scorecard | null {
  const start = rangeStart(points, months)
  const you = changeBetween(points, start)
  const spy = changeBetween(points, start, points.length - 1, (p) => p.spy)
  if (!you || !spy) return null
  return { youPct: you.returnPct, spyPct: spy.returnPct, leadPct: you.returnPct - spy.returnPct }
}

export type Portfolio = {
  timeline: Timeline
  /** When the newest stock price was quoted, ms since epoch. */
  pricesAsOf: number | null
  valueThb: number
  /** Value plus everything taken out, minus everything put in: realized + unrealized. */
  totalGainThb: number
  day: PeriodChange | null
  mom: PeriodChange | null
  yoy: PeriodChange | null
}

export function summarize(timeline: Timeline, pricesAsOf: number | null = null): Portfolio {
  const last = timeline.points.at(-1)
  const value = last?.value ?? 0
  const invested = last?.invested ?? 0
  return {
    timeline,
    pricesAsOf,
    valueThb: value,
    totalGainThb: value - invested,
    day: dayChange(timeline.points, timeline.latestSession),
    mom: periodChange(timeline.points, 1),
    yoy: periodChange(timeline.points, 12),
  }
}

/** Fetches SPY, USD/THB and every traded ticker's prices, then values the portfolio. */
export async function buildPortfolio(flows: CashFlow[], today: string): Promise<Portfolio> {
  if (!flows.length) throw new Error('No transactions yet')
  const start = flows[0].date
  // A trade can carry tomorrow's date (Thai time is ahead of New York).
  const end = flows.at(-1)!.date > today ? flows.at(-1)!.date : today
  const securities = [...new Set(flows.map((f) => f.security))]

  const [spy, fx, ...results] = await Promise.all([
    fetchPrices(BENCHMARK_SYMBOL, start, end),
    fetchPrices(FX_SYMBOL, start, end),
    // A ticker without history (e.g. delisted) falls back to its last trade price.
    ...securities.map((s) => fetchPrices(yahooSymbol(s), start, end).catch(() => null)),
  ])
  const prices = new Map(securities.map((s, i) => [s, results[i]]))
  // Stocks only: USD/THB trades around the clock, so it's always newer.
  const quoteTimes = [spy, ...results].map((p) => p?.latestAt ?? 0)
  const pricesAsOf = Math.max(...quoteTimes) || null
  return summarize(computeTimeline(flows, spy, fx, prices, end), pricesAsOf)
}
