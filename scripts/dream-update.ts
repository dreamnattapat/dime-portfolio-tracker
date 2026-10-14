/**
 * Fills Team Dream's orders at the latest closing prices and writes
 * public/dream/state.json: cash, holdings, every order's fill, the value
 * against SPY day by day, and how every decision in every meeting (including
 * stocks only watched or passed on) has done since, for the weekly lessons. Run by the GitHub Action after each US close, so the agents
 * start their next meeting from up-to-date numbers.
 *
 *   node scripts/dream-update.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import {
  computeDream,
  decisionOutcomes,
  effectiveSession,
  lastClosedSession,
  THEME_ETFS,
  type DreamLedger,
  type Postmarks,
} from '../src/lib/dream.ts'
import { PRICE_CHECK_TOLERANCE_PCT, type DreamReport } from '../src/lib/dreamTeam.ts'
import { chartEvents, parseChart, yahooSymbol, type PriceSeries } from '../src/lib/prices.ts'

const LEDGER = 'public/dream/ledger.json'
const STATE = 'public/dream/state.json'

async function fetchSeries(symbol: string, start: string, end: string): Promise<PriceSeries> {
  const day = (iso: string, add: number) => Date.parse(`${iso}T00:00:00Z`) / 1000 + add * 86400
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`)
  url.search = new URLSearchParams({
    period1: String(day(start, -7)),
    period2: String(day(end, 1)),
    interval: '1d',
    events: chartEvents(true),
  }).toString()
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`)
  return parseChart(symbol, (await response.json()) as Parameters<typeof parseChart>[1])
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as DreamLedger
// When each order was committed (scripts/dream-postmark.ts runs first in the Action).
const postmarks: Postmarks = existsSync('public/dream/postmarks.json')
  ? (JSON.parse(readFileSync('public/dream/postmarks.json', 'utf8')) as Postmarks)
  : { orders: {}, removed: [] }
const now = new Date()
const today = now.toISOString().slice(0, 10)
const closedThrough = lastClosedSession(now)
const index = JSON.parse(readFileSync('public/dream/reports/index.json', 'utf8')) as { reports: string[] }
const reports = index.reports.map(
  (date) => JSON.parse(readFileSync(`public/dream/reports/${date}.json`, 'utf8')) as DreamReport,
)
const decisions = reports.flatMap((report) =>
  report.decisions.map((d) => {
    // A decision with an order counts from the session that order really fills at.
    const order = ledger.orders.find((o) => o.id === d.orderId)
    return {
      reportDate: report.date,
      session: order ? effectiveSession(order, postmarks.orders[order.id]).session : report.session,
      ticker: d.ticker,
      action: d.action,
    }
  }),
)
const tickers = [...new Set([...ledger.orders.map((o) => o.ticker), ...decisions.map((d) => d.ticker)])]
const spy = await fetchSeries('SPY', ledger.startDate, today)
const prices = new Map<string, PriceSeries | null>(
  await Promise.all(
    tickers.map(async (t): Promise<[string, PriceSeries | null]> => {
      try {
        return [t, await fetchSeries(yahooSymbol(t), ledger.startDate, today)]
      } catch (e) {
        console.warn(`No prices for ${t}: ${(e as Error).message}`)
        return [t, null]
      }
    }),
  ),
)
const themes = new Map<string, PriceSeries | null>(
  await Promise.all(
    Object.values(THEME_ETFS).map(async (t): Promise<[string, PriceSeries | null]> => {
      try {
        return [t, await fetchSeries(t, ledger.startDate, today)]
      } catch (e) {
        console.warn(`No prices for ${t}: ${(e as Error).message}`)
        return [t, null]
      }
    }),
  ),
)
const state = computeDream(ledger, spy, prices, today, closedThrough, { postmarks: postmarks.orders, themes })

// Every price a meeting wrote down (priceUsd) against the real last close before that meeting.
const priceChecks = reports.flatMap((report) =>
  report.decisions.flatMap((d) => {
    const series = prices.get(d.ticker)
    if (d.priceUsd == null || !series) return []
    const i = series.dates.findLastIndex((day) => day < report.date)
    if (i < 0) return []
    const closeDate = series.dates[i]
    const closeUsd = series.on(closeDate)
    const diffPct = (d.priceUsd / closeUsd - 1) * 100
    return Math.abs(diffPct) > PRICE_CHECK_TOLERANCE_PCT
      ? [{ reportDate: report.date, ticker: d.ticker, priceUsd: d.priceUsd, closeDate, closeUsd, diffPct }]
      : []
  }),
)
const outcomes = decisionOutcomes(decisions, spy, prices, closedThrough)
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d
writeFileSync(
  STATE,
  JSON.stringify(
    {
      updatedAt: now.toISOString(),
      closedThrough,
      valueUsd: round(state.valueUsd, 2),
      cashUsd: round(state.cashUsd, 2),
      returnPct: round(state.returnPct, 3),
      spyReturnPct: round(state.spyReturnPct, 3),
      leadPct: round(state.returnPct - state.spyReturnPct, 3),
      themeReturnPct: state.themeReturnPct != null ? round(state.themeReturnPct, 3) : null,
      dividendsUsd: round(state.dividendsUsd, 2),
      holdings: state.holdings.map((h) => ({
        ticker: h.ticker,
        units: round(h.units, 6),
        avgCostUsd: round(h.avgCostUsd),
        priceUsd: round(h.priceUsd),
        valueUsd: round(h.valueUsd, 2),
        unrealizedPct: round(h.unrealizedPct, 2),
        weightPct: round(h.weightPct, 2),
      })),
      orders: state.fills.map((f) => ({
        id: f.id,
        session: f.session,
        effectiveSession: f.effectiveSession,
        postedAt: f.postedAt,
        late: f.late,
        ticker: f.ticker,
        side: f.side,
        usd: f.usd,
        fraction: f.fraction,
        status: f.status,
        fillDate: f.fillDate,
        price: f.price && round(f.price),
        refDate: f.refDate,
        refPrice: f.refPrice && round(f.refPrice),
        slipPct: f.slipPct != null ? round(f.slipPct, 2) : undefined,
        units: f.units && round(f.units, 6),
        cashUsd: f.cashUsd && round(f.cashUsd, 2),
        note: f.note,
      })),
      missing: state.missing,
      points: state.points.map((p) => ({
        date: p.date,
        valueUsd: round(p.value, 2),
        spyUsd: round(p.spy, 2),
        themesUsd: p.themes != null ? round(p.themes, 2) : undefined,
      })),
      priceChecks: priceChecks.map((c) => ({ ...c, closeUsd: round(c.closeUsd), diffPct: round(c.diffPct, 2) })),
      outcomes: outcomes.map((o) => ({
        ...o,
        fromPrice: round(o.fromPrice),
        toPrice: round(o.toPrice),
        returnPct: round(o.returnPct, 2),
        spyReturnPct: round(o.spyReturnPct, 2),
        vsSpyPct: round(o.vsSpyPct, 2),
      })),
    },
    null,
    1,
  ) + '\n',
)
console.log(
  `Dream ${closedThrough}: $${state.valueUsd.toFixed(2)} (${state.returnPct.toFixed(2)}%) vs SPY ${state.spyReturnPct.toFixed(2)}%`,
)
