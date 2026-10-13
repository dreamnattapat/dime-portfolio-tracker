/**
 * Fills Team Dream's orders at the latest closing prices and writes
 * public/dream/state.json: cash, holdings, every order's fill, the value
 * against SPY day by day, and how every decision in every meeting (including
 * stocks only watched or passed on) has done since, for the weekly lessons. Run by the GitHub Action after each US close, so the agents
 * start their next meeting from up-to-date numbers.
 *
 *   node scripts/dream-update.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { computeDream, decisionOutcomes, lastClosedSession, type DreamLedger } from '../src/lib/dream.ts'
import type { DreamReport } from '../src/lib/dreamTeam.ts'
import { parseChart, yahooSymbol, type PriceSeries } from '../src/lib/prices.ts'

const LEDGER = 'public/dream/ledger.json'
const STATE = 'public/dream/state.json'

async function fetchSeries(symbol: string, start: string, end: string): Promise<PriceSeries> {
  const day = (iso: string, add: number) => Date.parse(`${iso}T00:00:00Z`) / 1000 + add * 86400
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`)
  url.search = new URLSearchParams({
    period1: String(day(start, -7)),
    period2: String(day(end, 1)),
    interval: '1d',
    events: 'split',
  }).toString()
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`)
  return parseChart(symbol, (await response.json()) as Parameters<typeof parseChart>[1])
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as DreamLedger
const now = new Date()
const today = now.toISOString().slice(0, 10)
const closedThrough = lastClosedSession(now)
const index = JSON.parse(readFileSync('public/dream/reports/index.json', 'utf8')) as { reports: string[] }
const decisions = index.reports.flatMap((date) => {
  const report = JSON.parse(readFileSync(`public/dream/reports/${date}.json`, 'utf8')) as DreamReport
  return report.decisions.map((d) => ({
    reportDate: date,
    session: report.session,
    ticker: d.ticker,
    action: d.action,
  }))
})
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
const state = computeDream(ledger, spy, prices, today, closedThrough)
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
        ticker: f.ticker,
        side: f.side,
        status: f.status,
        fillDate: f.fillDate,
        price: f.price && round(f.price),
        units: f.units && round(f.units, 6),
        cashUsd: f.cashUsd && round(f.cashUsd, 2),
        note: f.note,
      })),
      missing: state.missing,
      points: state.points.map((p) => ({ date: p.date, valueUsd: round(p.value, 2), spyUsd: round(p.spy, 2) })),
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
