/**
 * Daily closing prices from Yahoo Finance's chart endpoint, through this
 * site's own proxy at /api/chart (worker/index.ts; Vite's dev proxy locally).
 * Browsers can't call Yahoo directly (no CORS), and going through the site
 * keeps the Content-Security-Policy at 'self'. Only a ticker symbol and a date
 * range are sent, nothing about the account or the trades.
 *
 * Ported from dime-auto-log-transactions/src/market_data.py. Closes are
 * split-adjusted but not dividend-adjusted (price return), matching the rest
 * of the dashboard, since dividends aren't tracked there. Team Lynch asks for
 * the dividends too (`dividends: true`) and credits them itself.
 */

export class PriceSeries {
  readonly symbol: string
  /** ISO YYYY-MM-DD trading days, ascending. */
  readonly dates: string[]
  private readonly closes: number[]
  readonly latest: number
  /** When `latest` was quoted, ms since epoch, if Yahoo said. */
  readonly latestAt: number | null
  /** [ISO date, ratio], e.g. 10 for a 10:1 split. */
  readonly splits: Split[]
  /** [ex-dividend ISO date, USD per share], when asked for; split-adjusted like the closes. */
  readonly dividends: Dividend[]

  constructor(
    symbol: string,
    closes: [string, number][],
    latest: number,
    splits: Split[] = [],
    latestAt: number | null = null,
    dividends: Dividend[] = [],
  ) {
    this.symbol = symbol
    this.dates = closes.map(([date]) => date)
    this.closes = closes.map(([, close]) => close)
    this.latest = latest
    this.latestAt = latestAt
    this.splits = splits
    this.dividends = dividends
  }

  /** The dividend per share going ex on `day` (0 if none). */
  dividendOn(day: string): number {
    return this.dividends.reduce((sum, [date, amount]) => (date === day ? sum + amount : sum), 0)
  }

  /** Close on `day`, or the last trading day before it. */
  on(day: string): number {
    // Binary search for the last date <= day.
    let lo = 0
    let hi = this.dates.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.dates[mid] <= day) lo = mid + 1
      else hi = mid
    }
    if (lo === 0) throw new RangeError(`No ${this.symbol} price on or before ${day}`)
    return this.closes[lo - 1]
  }

  /**
   * The same series with every close multiplied by `factor`, ending at
   * `latest`. Used to value at a broker's own exchange rate, assuming its gap
   * from the market rate stays about the same over time.
   */
  scaled(factor: number, latest: number): PriceSeries {
    return new PriceSeries(
      this.symbol,
      this.dates.map((date, i) => [date, this.closes[i] * factor]),
      latest,
      this.splits,
      this.latestAt,
      this.dividends.map(([date, amount]): Dividend => [date, amount * factor]),
    )
  }

  /**
   * Closes are split-adjusted back through history, so one share actually
   * held on `day` is this many shares in today's terms (product of later splits).
   */
  splitFactorAfter(day: string): number {
    return splitFactorAfter(this.splits, day)
  }
}

/** A stock split: [ISO date it takes effect, ratio], e.g. 10 for a 10:1 split. */
export type Split = [string, number]

/** A cash dividend: [ex-dividend ISO date, amount per share]. */
export type Dividend = [string, number]

/** How many of today's shares one share held on `day` became: the product of the splits after it. */
export function splitFactorAfter(splits: Split[] | undefined, day: string): number {
  return (splits ?? []).reduce((factor, [date, ratio]) => (date > day ? factor * ratio : factor), 1)
}

/** Dime! writes share classes with a dot (BRK.B); Yahoo uses a dash. */
export function yahooSymbol(security: string): string {
  return security.replaceAll('.', '-')
}

type ChartResponse = {
  chart?: {
    error?: { description?: string } | null
    result?: {
      meta: { gmtoffset?: number; regularMarketPrice?: number; regularMarketTime?: number }
      timestamp?: number[]
      indicators: { quote: { close: (number | null)[] }[] }
      events?: {
        splits?: Record<string, { date: number; numerator: number; denominator: number }>
        dividends?: Record<string, { date: number; amount: number }>
      }
    }[]
  }
}

/** Unix seconds -> exchange-local ISO date. */
function localDate(seconds: number, gmtOffset: number): string {
  return new Date((seconds + gmtOffset) * 1000).toISOString().slice(0, 10)
}

function midnightUtc(isoDate: string, addDays = 0): number {
  return Date.parse(`${isoDate}T00:00:00Z`) / 1000 + addDays * 86400
}

export function parseChart(symbol: string, data: ChartResponse): PriceSeries {
  const result = data.chart?.result?.[0]
  if (!result) throw new Error(`No price data for ${symbol}: ${data.chart?.error?.description ?? 'unknown error'}`)
  // Timestamps are the session open in UTC; shifting by the exchange's offset
  // lands them on the exchange's local trading date.
  const offset = result.meta.gmtoffset ?? 0
  const rawCloses = result.indicators.quote[0]?.close ?? []
  const closes: [string, number][] = []
  ;(result.timestamp ?? []).forEach((ts, i) => {
    const close = rawCloses[i]
    if (close != null) closes.push([localDate(ts, offset), close])
  })
  if (!closes.length) throw new Error(`No closing prices for ${symbol}`)
  const splits = Object.values(result.events?.splits ?? {})
    .filter((s) => s.denominator)
    .map((s): Split => [localDate(s.date, offset), s.numerator / s.denominator])
  const dividends = Object.values(result.events?.dividends ?? {})
    .filter((d) => d.amount > 0)
    .map((d): Dividend => [localDate(d.date, offset), d.amount])
    .sort((a, b) => a[0].localeCompare(b[0]))
  const { regularMarketPrice, regularMarketTime } = result.meta
  return new PriceSeries(
    symbol,
    closes,
    regularMarketPrice ?? closes.at(-1)![1],
    splits,
    regularMarketTime ? regularMarketTime * 1000 : null,
    dividends,
  )
}

// One download per symbol and date range per page load; the dashboard asks again whenever trades change.
const cache = new Map<string, Promise<PriceSeries>>()

/** Yahoo's `events` parameter: splits only, or dividends and splits (as yfinance asks for them). */
export function chartEvents(dividends = false): string {
  return dividends ? 'div,splits' : 'split'
}

export function fetchPrices(
  symbol: string,
  start: string,
  today: string,
  { dividends = false }: { dividends?: boolean } = {},
): Promise<PriceSeries> {
  const query = new URLSearchParams({
    // Pad the start so a trade on a market holiday can fall back to the
    // previous close. Whole days keep the URL stable, so it caches well.
    period1: String(midnightUtc(start, -7)),
    period2: String(midnightUtc(today, 1)),
    interval: '1d',
    events: chartEvents(dividends),
  })
  const url = `/api/chart/${encodeURIComponent(symbol)}?${query}`
  let prices = cache.get(url)
  if (!prices) {
    prices = download(symbol, url)
    cache.set(url, prices)
    prices.catch(() => cache.delete(url)) // try again next time
  }
  return prices
}

async function download(symbol: string, url: string): Promise<PriceSeries> {
  const response = await fetch(url)
  const data = (await response.json().catch(() => null)) as ChartResponse | null
  if (!response.ok && !data?.chart) throw new Error(`Price lookup for ${symbol} failed (HTTP ${response.status})`)
  return parseChart(symbol, data ?? {})
}
