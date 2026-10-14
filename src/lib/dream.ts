/**
 * Team Dream: a paper portfolio run by AI agents, trying to beat the S&P 500.
 *
 * The agents only write orders (public/dream/ledger.json); everything else is
 * worked out here from market prices, the same way for the website and the
 * daily script (scripts/dream-update.ts):
 *
 * - An order is decided before its US session opens and fills at that
 *   session's closing price (or the next session's, if the market is shut),
 *   so no decision ever sees the price it trades at.
 * - Each fill pays Dime!'s commission (0.15% + 7% VAT), so the challenge is
 *   fair against a real Dime! account.
 * - Buys spend a USD amount (cut to the cash available); sells sell a share
 *   of the holding. Long only: no borrowing, no shorting.
 * - An order only counts as decided when it was committed (its postmark,
 *   from git history, public/dream/postmarks.json). One committed after its
 *   session had opened moves to the next session, so a late meeting can't
 *   trade at a close it may have seen.
 * - Dividends: cash dividends on what the team holds are paid into its cash
 *   on the ex-date, less the 15% US tax a Thai investor pays. The benchmarks
 *   get the same dividends (after the same tax) reinvested, so neither side
 *   gets them for free.
 * - Benchmarks: the same starting cash put into SPY at the close of the first
 *   session and held; and, to tell stock picking apart from picking the four
 *   themes, the same cash split equally across one ETF per theme
 *   (THEME_ETFS) and held.
 *
 * Imports use relative paths with extensions so Node can run the scripts
 * directly (type stripping), as well as Vite.
 */
import { PriceSeries } from './prices.ts'

/** US tax withheld on dividends paid to a Thai investor (the US-Thailand treaty rate). */
export const DIVIDEND_TAX = 0.15

/** One ETF per theme, held equally: the "picked the right themes" benchmark. */
export const THEME_ETFS: Record<'tech' | 'space' | 'health' | 'energy', string> = {
  tech: 'XLK',
  space: 'UFO',
  health: 'XLV',
  energy: 'XLE',
}

/** When an order was committed: from the git history (scripts/dream-postmark.ts). */
export type Postmark = {
  /** The commit that wrote the order as it stands now, ISO time. */
  at: string
  /** When the order first appeared, if it has been changed since. */
  firstAt?: string
  /** How many times it was changed after it first appeared. */
  edits?: number
}

/** public/dream/postmarks.json */
export type Postmarks = {
  orders: Record<string, Postmark>
  /** Orders that were in the ledger once and later taken out, and when. */
  removed: { id: string; at: string }[]
}

/** An order's content, independent of key order and formatting, to tell whether it changed. */
export function orderKey(o: DreamOrder): string {
  return JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))))
}

/** Orders are final once committed: changing or removing one from this time on fails the check. */
export const ORDERS_LOCKED_FROM = '2026-10-14T00:00:00Z'

export type DreamOrder = {
  id: string
  /** The meeting (report) that placed it, YYYY-MM-DD in Bangkok. */
  reportDate: string
  /** The US session whose close fills it, YYYY-MM-DD (the next one open if the market is shut that day). */
  session: string
  ticker: string
  side: 'buy' | 'sell'
  /** Buys: USD to spend on shares (commission comes on top). */
  usd?: number
  /** Sells: the share of the holding to sell, above 0 up to 1 (all). */
  fraction?: number
  /** Why, in a sentence (Thai). */
  reason: string
}

export type DreamLedger = {
  startDate: string
  startingCashUsd: number
  /** Commission per fill, % of the trade's value, VAT included. */
  commissionPct: number
  orders: DreamOrder[]
}

export type DreamFill = DreamOrder & {
  status: 'filled' | 'pending' | 'rejected'
  /** When it was committed, if known; and whether that was after its session opened (then it fills a session later). */
  postedAt?: string
  late?: boolean
  /** The session it actually fills at: `session`, or a later one if it was late. */
  effectiveSession: string
  fillDate?: string
  price?: number
  /** The last close the team could see at the meeting (before `reportDate`), and how far the fill price is from it, %. */
  refDate?: string
  refPrice?: number
  /** (fill / refPrice - 1) * 100. For a buy, above 0 means it cost more than the price at the meeting. */
  slipPct?: number
  units?: number
  /** Cash in (+) or out (-), commission included. */
  cashUsd?: number
  commissionUsd?: number
  note?: string
}

export type DreamHolding = {
  ticker: string
  units: number
  /** Average cost per share, excluding commission (as the Dime! app shows it). */
  avgCostUsd: number
  priceUsd: number
  valueUsd: number
  unrealizedUsd: number
  unrealizedPct: number
  /** Share of the whole portfolio (cash included), %. */
  weightPct: number
}

export type DreamPoint = {
  date: string
  /** Dream's value: cash plus holdings, USD. */
  value: number
  /** The same starting cash held in SPY (dividends reinvested after tax), USD. */
  spy: number
  /** The same starting cash split equally across THEME_ETFS, held the same way. */
  themes?: number
}

export type DreamState = {
  /** The last session whose closing prices are final. */
  closedThrough: string
  cashUsd: number
  valueUsd: number
  holdings: DreamHolding[]
  /** Every order, oldest first, with how it filled. */
  fills: DreamFill[]
  /** From the close before the first session (the starting cash) to today. */
  points: DreamPoint[]
  returnPct: number
  spyReturnPct: number
  /** The four-theme ETF basket, if all its prices loaded. */
  themeReturnPct: number | null
  /** Dividends paid into the team's cash so far, after tax. */
  dividendsUsd: number
  /** Tickers with no price history (their orders are rejected). */
  missing: string[]
}

const EPS = 1e-9

/**
 * The last US session whose close is final, as of `now`: today in New York
 * once it's past 16:10 there, otherwise yesterday. (A weekend or holiday date
 * is fine: fills only happen on days with prices.)
 */
export function lastClosedSession(now: Date): string {
  const { date, minutes } = newYorkTime(now)
  if (minutes >= 16 * 60 + 10) return date
  return addDays(date, -1)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The date and minutes past midnight in New York. */
function newYorkTime(now: Date): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/**
 * The first US session an order committed at `at` can trade in: that day's
 * if it was committed before the 9:30 New York open, otherwise the next day's
 * (a weekend or holiday date is fine: fills wait for the next day with prices).
 */
export function firstSessionAfter(at: Date): string {
  const { date, minutes } = newYorkTime(at)
  return minutes < 9 * 60 + 30 ? date : addDays(date, 1)
}

/** The session an order really fills at, given when it was committed. */
export function effectiveSession(order: DreamOrder, postmark?: Postmark): { session: string; late: boolean } {
  if (!postmark) return { session: order.session, late: false }
  const earliest = firstSessionAfter(new Date(postmark.at))
  return earliest > order.session ? { session: earliest, late: true } : { session: order.session, late: false }
}

export function computeDream(
  ledger: DreamLedger,
  spy: PriceSeries,
  prices: Map<string, PriceSeries | null>,
  today: string,
  closedThrough: string,
  { postmarks = {}, themes }: { postmarks?: Record<string, Postmark>; themes?: Map<string, PriceSeries | null> } = {},
): DreamState {
  const rate = ledger.commissionPct / 100
  const keep = 1 - DIVIDEND_TAX
  const missing = [...new Set(ledger.orders.map((o) => o.ticker))].filter((t) => !prices.get(t)).sort()
  const fills: DreamFill[] = ledger.orders
    .map((o): DreamFill => {
      const pm = postmarks[o.id]
      const eff = effectiveSession(o, pm)
      return {
        ...o,
        status: 'pending',
        postedAt: pm?.at,
        late: eff.late || undefined,
        effectiveSession: eff.session,
      }
    })
    .sort((a, b) => a.effectiveSession.localeCompare(b.effectiveSession) || a.id.localeCompare(b.id))
  const holdings = new Map<string, { units: number; costUsd: number }>()
  let cash = ledger.startingCashUsd

  const sessions = spy.dates.filter((d) => d >= ledger.startDate)
  const firstSession = sessions[0]
  const origin = spy.dates.findLast((d) => d < ledger.startDate) ?? ledger.startDate
  const started = !!firstSession && firstSession <= closedThrough
  // Benchmarks hold units bought at the first session's close; dividends buy more at that day's close.
  const spyBench = started ? { series: spy, units: cash / spy.on(firstSession) } : null
  const themeSeries = themes ? Object.values(THEME_ETFS).map((t) => themes.get(t) ?? null) : []
  const themeBench =
    started && themeSeries.length && themeSeries.every((s) => s && s.dates.some((d) => d <= firstSession))
      ? themeSeries.map((series) => ({ series: series!, units: cash / themeSeries.length / series!.on(firstSession) }))
      : null
  let dividendsUsd = 0
  const points: DreamPoint[] = [{ date: origin, value: cash, spy: cash, ...(themeBench ? { themes: cash } : {}) }]

  // Every session since the start, then today at the latest prices (unless today's session has closed).
  const days = [...sessions.filter((d) => d < today), today]
  let lastLive = false
  for (const day of days) {
    const isSession = sessions.includes(day) && day <= closedThrough
    if (isSession) {
      payDividends(day)
      fillOn(day)
    }
    const isLive = day === today && !isSession
    lastLive = isLive
    let value = cash
    for (const [ticker, h] of holdings) value += h.units * priceOf(ticker, day, isLive)
    const benchValue = (b: { series: PriceSeries; units: number }) =>
      b.units * (isLive ? b.series.latest : b.series.on(day))
    points.push({
      date: day,
      value,
      spy: spyBench && day >= firstSession ? benchValue(spyBench) : ledger.startingCashUsd,
      ...(themeBench
        ? {
            themes:
              day >= firstSession ? themeBench.reduce((sum, b) => sum + benchValue(b), 0) : ledger.startingCashUsd,
          }
        : {}),
    })
  }

  /** Dividends going ex today: on shares held at yesterday's close, before today's fills. */
  function payDividends(day: string) {
    for (const [ticker, h] of holdings) {
      const amount = prices.get(ticker)?.dividendOn(day) ?? 0
      if (amount > 0) {
        cash += h.units * amount * keep
        dividendsUsd += h.units * amount * keep
      }
    }
    // The benchmarks bought at the first session's close, so they collect from the next session on.
    if (day <= firstSession) return
    for (const b of [...(spyBench ? [spyBench] : []), ...(themeBench ?? [])]) {
      const amount = b.series.dividendOn(day)
      if (amount > 0) b.units += (b.units * amount * keep) / b.series.on(day)
    }
  }

  function priceOf(ticker: string, day: string, live: boolean): number {
    const series = prices.get(ticker)!
    return live ? series.latest : series.on(day)
  }

  function closeOn(ticker: string, day: string): number | null {
    const series = prices.get(ticker)
    if (!series) return null
    const i = series.dates.indexOf(day)
    return i < 0 ? null : series.on(day)
  }

  /** What the team saw at the meeting: the last close before the meeting's date. */
  function seenAtMeeting(ticker: string, reportDate: string): { refDate?: string; refPrice?: number } {
    const series = prices.get(ticker)
    if (!series) return {}
    const i = series.dates.findLastIndex((d) => d < reportDate)
    return i < 0 ? {} : { refDate: series.dates[i], refPrice: series.on(series.dates[i]) }
  }

  function slippage(f: DreamFill, price: number) {
    const ref = seenAtMeeting(f.ticker, f.reportDate)
    return { ...ref, slipPct: ref.refPrice ? (price / ref.refPrice - 1) * 100 : undefined }
  }

  function fillOn(day: string) {
    const due = fills.filter((f) => f.status === 'pending' && f.effectiveSession <= day)
    // Sells first, so their cash can pay for the day's buys.
    for (const f of [...due.filter((f) => f.side === 'sell'), ...due.filter((f) => f.side === 'buy')]) {
      if (!prices.get(f.ticker)) {
        Object.assign(f, { status: 'rejected', note: 'ไม่พบราคาของหุ้นตัวนี้' })
        continue
      }
      const price = closeOn(f.ticker, day)
      if (price == null) continue // no trading in it today (e.g. halted): try the next session
      if (f.side === 'buy') {
        const gross = Math.min(f.usd ?? 0, cash / (1 + rate))
        if (gross < 1) {
          Object.assign(f, { status: 'rejected', note: 'เงินสดไม่พอ' })
          continue
        }
        const commission = gross * rate
        const units = gross / price
        const h = holdings.get(f.ticker) ?? { units: 0, costUsd: 0 }
        h.units += units
        h.costUsd += gross
        holdings.set(f.ticker, h)
        cash -= gross + commission
        Object.assign(f, {
          status: 'filled',
          fillDate: day,
          price,
          ...slippage(f, price),
          units,
          cashUsd: -(gross + commission),
          commissionUsd: commission,
          note: lateNote(f) ?? (gross < (f.usd ?? 0) - 0.005 ? 'ซื้อได้เท่าที่เงินสดเหลือ' : undefined),
        })
      } else {
        const h = holdings.get(f.ticker)
        const fraction = Math.min(1, Math.max(0, f.fraction ?? 0))
        if (!h || h.units < EPS || fraction <= 0) {
          Object.assign(f, { status: 'rejected', note: 'ไม่มีหุ้นตัวนี้ให้ขาย' })
          continue
        }
        const units = h.units * fraction
        const gross = units * price
        const commission = gross * rate
        h.costUsd -= h.costUsd * fraction
        h.units -= units
        if (fraction >= 1 || h.units < EPS) holdings.delete(f.ticker)
        cash += gross - commission
        Object.assign(f, {
          status: 'filled',
          fillDate: day,
          price,
          ...slippage(f, price),
          units,
          cashUsd: gross - commission,
          commissionUsd: commission,
          note: lateNote(f),
        })
      }
    }
  }

  function lateNote(f: DreamFill): string | undefined {
    return f.late ? 'ส่งคำสั่งหลังตลาดรอบนั้นเปิดแล้ว จึงเลื่อนไปรอบถัดไป' : undefined
  }

  const last = points.at(-1)!
  const held: DreamHolding[] = [...holdings].map(([ticker, h]) => {
    const price = priceOf(ticker, today, lastLive)
    const valueUsd = h.units * price
    return {
      ticker,
      units: h.units,
      avgCostUsd: h.costUsd / h.units,
      priceUsd: price,
      valueUsd,
      unrealizedUsd: valueUsd - h.costUsd,
      unrealizedPct: (valueUsd / h.costUsd - 1) * 100,
      weightPct: (valueUsd / last.value) * 100,
    }
  })
  held.sort((a, b) => b.valueUsd - a.valueUsd)

  return {
    closedThrough,
    cashUsd: cash,
    valueUsd: last.value,
    holdings: held,
    fills,
    points,
    returnPct: (last.value / ledger.startingCashUsd - 1) * 100,
    spyReturnPct: (last.spy / ledger.startingCashUsd - 1) * 100,
    themeReturnPct: last.themes != null ? (last.themes / ledger.startingCashUsd - 1) * 100 : null,
    dividendsUsd,
    missing,
  }
}

/** One decision from a meeting (buy, sell, hold or watch) and how the stock has done since. */
export type DecisionOutcome = {
  reportDate: string
  ticker: string
  action: string
  /** The close of the session the meeting traded at (the first one on or after `session`). */
  fromDate: string
  fromPrice: number
  /** The latest close counted (up to `closedThrough`). */
  toDate: string
  toPrice: number
  returnPct: number
  /** SPY over the same days. */
  spyReturnPct: number
  /** returnPct - spyReturnPct: how the call did against just owning the index. */
  vsSpyPct: number
  /** US sessions since the decision. */
  sessions: number
}

/**
 * How each decision has played out since, against SPY: the material for the
 * team's weekly lessons. Includes stocks the team only watched or passed on,
 * so it can learn from what it didn't buy too. Undefined until the decision's
 * session has closed; tickers without prices are left out.
 */
export function decisionOutcomes(
  decisions: { reportDate: string; session: string; ticker: string; action: string }[],
  spy: PriceSeries,
  prices: Map<string, PriceSeries | null>,
  closedThrough: string,
): DecisionOutcome[] {
  const sessions = spy.dates.filter((d) => d <= closedThrough)
  const out: DecisionOutcome[] = []
  for (const d of decisions) {
    const series = prices.get(d.ticker)
    const from = sessions.find((s) => s >= d.session)
    const to = sessions.at(-1)
    if (!series || !from || !to) continue
    const fromPrice = series.on(from)
    const toPrice = series.on(to)
    const returnPct = (toPrice / fromPrice - 1) * 100
    const spyReturnPct = (spy.on(to) / spy.on(from) - 1) * 100
    out.push({
      reportDate: d.reportDate,
      ticker: d.ticker,
      action: d.action,
      fromDate: from,
      fromPrice,
      toDate: to,
      toPrice,
      returnPct,
      spyReturnPct,
      vsSpyPct: returnPct - spyReturnPct,
      sessions: sessions.filter((s) => s > from).length,
    })
  }
  return out
}
