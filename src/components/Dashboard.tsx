import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { AssetsTable } from '@/components/AssetsTable'
import { DayMood } from '@/components/DayMood'
import { PortfolioChart } from '@/components/PortfolioChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { computeAnalytics, WIN_RATE_EXCLUDED, type TradeStats } from '@/lib/analytics'
import { buildPortfolio, type PeriodChange, type Portfolio } from '@/lib/benchmark'
import { computeAssetPnl, sumAssets } from '@/lib/assets'
import type { Transaction } from '@/lib/db'
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatSignedThb,
  formatThb,
  localToday,
} from '@/lib/format'

/** The latest price lookup, and which trades it was for. */
type Loaded = { flowsKey: string; portfolio: Portfolio | null; error: string | null }

export function Dashboard({ transactions, lastSynced }: { transactions: Transaction[]; lastSynced: string | null }) {
  const analytics = useMemo(() => computeAnalytics(transactions), [transactions])
  // The database emits a new array on every write (many per sync); only
  // refetch prices when the trades themselves change.
  const flowsKey = JSON.stringify(analytics.cashFlows)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    const done = (portfolio: Portfolio | null, error: string | null) => {
      if (!cancelled) setLoaded({ flowsKey, portfolio, error })
    }
    // Wait for a sync to settle rather than refetching after every email.
    const timer = setTimeout(() => {
      buildPortfolio(JSON.parse(flowsKey), localToday())
        .then((portfolio) => done(portfolio, null))
        .catch((e: Error) => done(null, e.message))
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [flowsKey])

  const loading = loaded?.flowsKey !== flowsKey
  // While trades change, keep showing the previous figures until the new ones are ready.
  const portfolio = loaded?.portfolio ?? null
  const error = loading ? null : (loaded?.error ?? null)
  const pending = loading ? '…' : '—'
  const assets = useMemo(() => computeAssetPnl(analytics, portfolio?.timeline ?? null), [analytics, portfolio])
  const unrealized = sumAssets(assets, (a) => a.unrealizedThb)
  const totalPnl = unrealized == null ? null : analytics.realizedPnlThb + unrealized
  // What Dime! leaves out of P&L: the exchange-rate move on what's held (less its buy fees).
  const uncounted = portfolio && totalPnl != null ? portfolio.totalGainThb - totalPnl : null
  const { stats } = analytics

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-xs">
        {lastSynced && <>Trades synced {formatDateTime(lastSynced)}</>}
        {lastSynced && ' · '}
        {loading
          ? 'Fetching prices…'
          : portfolio?.pricesAsOf
            ? `Prices as of ${formatDateTime(portfolio.pricesAsOf)} (refreshes when you reload)`
            : null}
      </p>

      {error && (
        <p className="text-muted-foreground text-sm">
          Market prices are unavailable right now ({error}), so only realized figures are shown.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <ValueCard portfolio={portfolio} pending={pending} />

        <StatCard label="Total P&L">
          <p className="text-3xl font-semibold tracking-tight">
            {totalPnl == null ? pending : formatSignedThb(totalPnl)}
          </p>
          <dl className="text-muted-foreground space-y-1 text-sm">
            <Row label="Realized">{formatSignedThb(analytics.realizedPnlThb)}</Row>
            <Row label="Unrealized">{unrealized == null ? pending : formatSignedThb(unrealized)}</Row>
          </dl>
          {uncounted != null && Math.abs(uncounted) >= 1 && (
            <p
              className="text-muted-foreground text-xs"
              title="Like Dime!, unrealized P&L is the stock price vs your average cost (excluding fees), converted at today's rate. So a change in USD/THB since you bought, and the buy fees, aren't counted. Your baht value includes them."
            >
              Not counted, as in Dime!: {formatSignedThb(uncounted)} from the USD/THB move and buy fees on what you hold
            </p>
          )}
        </StatCard>

        <StatCard label="Win rate">
          <p className="text-3xl font-semibold tracking-tight">{formatPercent(stats.winRatePct, { decimals: 0 })}</p>
          <p className="text-muted-foreground text-sm">
            {stats.wins} of {stats.rated} closed trades made money
            {WIN_RATE_EXCLUDED.size > 0 && ` (excludes ${[...WIN_RATE_EXCLUDED].join(', ')})`}
          </p>
        </StatCard>
      </div>

      <PayoffCard stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>Your portfolio vs the S&P 500</CardTitle>
          <CardDescription>
            The S&P 500 line makes every buy and sell you made, for the same amount on the same day, in SPY instead.
            Both are valued in THB at each day's close; dividends and the mirror's fees are left out.
            {portfolio?.xirrPct != null && portfolio.spyXirrPct != null && (
              <>
                {' '}
                Annualized return: you {formatPercent(portfolio.xirrPct, { signed: true })}, S&P 500{' '}
                {formatPercent(portfolio.spyXirrPct, { signed: true })}.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portfolio ? (
            <>
              <PortfolioChart points={portfolio.timeline.points} />
              {portfolio.timeline.approximated.length > 0 && (
                <p className="text-muted-foreground mt-3 text-xs">
                  No market prices for {portfolio.timeline.approximated.join(', ')}; valued at the last price you traded
                  at.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              {loading ? 'Fetching market prices…' : 'Chart unavailable without market prices.'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>P&L by asset</CardTitle>
          <CardDescription>
            Unrealized is how far the price is above or below your average cost, as in the Dime! app (average cost
            excludes fees; converted at today's USD/THB rate). Realized is the baht you made or lost on shares already
            sold, including fees and currency moves.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssetsTable assets={assets} loading={loading} />
        </CardContent>
      </Card>

      {analytics.incompleteBasisTrades > 0 && (
        <p className="text-muted-foreground text-xs">
          {analytics.incompleteBasisTrades} sell(s) have no matching buy in your Gmail history (bought before the emails
          start?), so their realized P&L counts the whole sale as profit.
        </p>
      )}
    </div>
  )
}

const TWR_HINT =
  "% is the time-weighted return, so money you add or withdraw doesn't count as growth. ฿ is the change in value minus money added."

function ValueCard({ portfolio, pending }: { portfolio: Portfolio | null; pending: string }) {
  const day = portfolio?.day
  const mood = !day || day.returnPct === 0 ? null : day.returnPct > 0 ? 'up' : 'down'

  return (
    <StatCard label="Total asset" className="relative">
      {/* Plays once when the day's change is known; click to replay. */}
      {mood && (
        <div className="absolute top-5 right-5">
          <DayMood mood={mood} />
        </div>
      )}
      <p className="text-3xl font-semibold tracking-tight">{portfolio ? formatThb(portfolio.valueThb) : pending}</p>
      <div className="space-y-1 text-sm">
        <Delta
          label="1D"
          change={day}
          pending={!portfolio}
          title={`The latest US trading day${portfolio ? ` (${formatDate(portfolio.timeline.latestSession)})` : ''} vs the close before it, including the USD/THB move. ${TWR_HINT}`}
        />
        <Delta label="MoM" change={portfolio?.mom} pending={!portfolio} title={TWR_HINT} />
        <Delta label="YoY" change={portfolio?.yoy} pending={!portfolio} title={TWR_HINT} />
      </div>
    </StatCard>
  )
}

function StatCard({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <Card className={`gap-3 ${className ?? ''}`}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-foreground tabular-nums">{children}</dd>
    </div>
  )
}

/** A period's return with an arrow, so direction never relies on color alone. */
function Delta({
  label,
  change,
  pending,
  title,
}: {
  label: string
  change?: PeriodChange | null
  pending: boolean
  title: string
}) {
  if (!change) {
    return (
      <p className="text-muted-foreground">
        {label} {pending ? '…' : '— not enough history'}
      </p>
    )
  }
  const up = change.returnPct >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <p className="flex items-center gap-1.5" title={title}>
      <span className="text-muted-foreground w-9">{label}</span>
      <span className={`flex items-center font-medium ${up ? 'text-delta-up' : 'text-delta-down'}`}>
        <Arrow className="size-4" aria-hidden />
        {formatPercent(change.returnPct, { signed: true })}
      </span>
      <span className="text-muted-foreground tabular-nums">({formatSignedThb(change.gainThb)})</span>
    </p>
  )
}

/** Win rate next to the win rate needed to break even, given how big wins and losses are. */
function PayoffCard({ stats }: { stats: TradeStats }) {
  const { winRatePct, breakEvenWinRatePct, avgWinThb, avgLossThb, payoffRatio } = stats
  const comparable = winRatePct != null && breakEvenWinRatePct != null
  const ahead = comparable && winRatePct >= breakEvenWinRatePct

  return (
    <Card>
      <CardHeader>
        <CardTitle>Does the win rate pay off?</CardTitle>
        <CardDescription>
          Winning often isn't enough if the losses are bigger than the wins. The bigger your average loss is next to
          your average win, the higher the win rate you need just to break even.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {comparable ? (
          <>
            <WinRateMeter winRatePct={winRatePct} breakEvenPct={breakEvenWinRatePct} ahead={ahead} />
            <p className="text-sm">
              {ahead ? 'Your wins outweigh your losses: ' : 'Your losses outweigh your wins: '}
              you win {formatPercent(winRatePct, { decimals: 0 })} of trades, and with an average win of{' '}
              {formatThb(avgWinThb)} against an average loss of {formatThb(avgLossThb)}, you need{' '}
              {formatPercent(breakEvenWinRatePct, { decimals: 0 })} to break even.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {stats.rated === 0
              ? 'No closed trades yet.'
              : stats.losses === 0
                ? 'No losing trades yet, so there is no average loss to compare against.'
                : 'No winning trades yet.'}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Average win" value={formatThb(avgWinThb)} />
          <Metric label="Average loss" value={avgLossThb == null ? '—' : formatThb(-avgLossThb)} />
          <Metric
            label="Payoff ratio"
            value={payoffRatio == null ? '—' : `${formatNumber(payoffRatio)}×`}
            hint="Average win ÷ average loss"
          />
          <Metric
            label="Expectancy"
            value={formatSignedThb(stats.expectancyThb)}
            hint={
              stats.profitFactor == null
                ? 'Average P&L per trade'
                : `Average P&L per trade · profit factor ${formatNumber(stats.profitFactor)}`
            }
          />
        </dl>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-muted-foreground text-xs">{hint}</dd>}
    </div>
  )
}

function WinRateMeter({
  winRatePct,
  breakEvenPct,
  ahead,
}: {
  winRatePct: number
  breakEvenPct: number
  ahead: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div
        className="bg-muted relative h-2.5 rounded-full"
        role="img"
        aria-label={`Win rate ${Math.round(winRatePct)}%, break-even ${Math.round(breakEvenPct)}%`}
      >
        <div
          className={`h-full rounded-full ${ahead ? 'bg-delta-up' : 'bg-delta-down'}`}
          style={{ width: `${winRatePct}%` }}
        />
        <div
          className="bg-foreground absolute -top-1 h-4.5 w-0.5 rounded-full"
          style={{ left: `calc(${breakEvenPct}% - 1px)` }}
        />
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${ahead ? 'bg-delta-up' : 'bg-delta-down'}`} aria-hidden />
          Your win rate {formatPercent(winRatePct, { decimals: 0 })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground h-3 w-0.5 rounded-full" aria-hidden />
          Break-even {formatPercent(breakEvenPct, { decimals: 0 })}
        </span>
      </div>
    </div>
  )
}
