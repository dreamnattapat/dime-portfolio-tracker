import { useEffect, useState } from 'react'

import {
  computeDream,
  lastClosedSession,
  THEME_ETFS,
  type DreamLedger,
  type DreamState,
  type Postmarks,
} from '@/lib/dream'
import { localToday } from '@/lib/format'
import { fetchPrices, yahooSymbol, type PriceSeries } from '@/lib/prices'

export type DreamData = {
  ledger: DreamLedger
  state: DreamState
  /** USD/THB, for showing Dream in baht next to your portfolio. */
  fx: PriceSeries
  /** Meeting dates, oldest first. */
  reports: string[]
}

/** Fetches a JSON file from the site, always checking for a newer copy (the team updates them daily). */
export async function fetchDreamJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()) as T
}

/** Team Dream's ledger, valued at market prices the same way as everything else on the site. */
export function useDream(): { data: DreamData | null; error: string | null } {
  const [data, setData] = useState<DreamData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [ledger, index, postmarks] = await Promise.all([
        fetchDreamJson<DreamLedger>('/dream/ledger.json'),
        fetchDreamJson<{ reports: string[] }>('/dream/reports/index.json'),
        // Written by the daily Action; until then every order counts as on time.
        fetchDreamJson<Postmarks>('/dream/postmarks.json').catch(() => null),
      ])
      const today = localToday()
      const tickers = [...new Set(ledger.orders.map((o) => o.ticker))]
      const etfs = Object.values(THEME_ETFS)
      const withDividends = { dividends: true }
      const [spy, fx, ...series] = await Promise.all([
        fetchPrices('SPY', ledger.startDate, today, withDividends),
        fetchPrices('THB=X', ledger.startDate, today),
        ...tickers.map((t) => fetchPrices(yahooSymbol(t), ledger.startDate, today, withDividends).catch(() => null)),
        ...etfs.map((t) => fetchPrices(t, ledger.startDate, today, withDividends).catch(() => null)),
      ])
      const prices = new Map(tickers.map((t, i) => [t, series[i]]))
      const themes = new Map(etfs.map((t, i) => [t, series[tickers.length + i]]))
      const state = computeDream(ledger, spy, prices, today, lastClosedSession(new Date()), {
        postmarks: postmarks?.orders,
        themes,
      })
      if (!cancelled) setData({ ledger, state, fx, reports: index.reports })
    })().catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  return { data, error }
}
