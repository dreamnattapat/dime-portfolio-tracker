import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { PortfolioChart } from '@/components/PortfolioChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { computeAnalytics, WIN_RATE_EXCLUDED, type TradeStats } from '@/lib/analytics'
import { buildPortfolio, type PeriodChange, type Portfolio } from '@/lib/benchmark'
import type { Transaction } from '@/lib/db'
import { formatNumber, formatPercent, formatSignedThb, formatThb, localToday } from '@/lib/format'

/** The latest price lookup, and which trades it was for. */
type Loaded = { flowsKey: string; portfolio: Portfolio | null; error: string | null }

export function Dashboard({ transactions }: { transactions: Transaction[] }) {
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
  const unrealized = portfolio ? portfolio.totalGainThb - analytics.realizedPnlThb : null
  const { stats } = analytics

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-muted-foreground text-sm">
          Market prices are unavailable right now ({error}), so only realized figures are shown.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Portfolio value">
          <p className="text-3xl font-semibold tracking-tight">{portfolio ? formatThb(portfolio.valueThb) : pending}</p>
          <div className="space-y-1 text-sm">
            <Delta label="MoM" change={portfolio?.mom} pending={!portfolio} />
            <Delta label="YoY" change={portfolio?.yoy} pending={!portfolio} />
          </div>
        </StatCard>

        <StatCard label="Total P&L">
          <p className="text-3xl font-semibold tracking-tight">
            {portfolio ? formatSignedThb(portfolio.totalGainThb) : pending}
          </p>
          <dl className="text-muted-foreground space-y-1 text-sm">
            <Row label="Realized">{formatSignedThb(analytics.realizedPnlThb)}</Row>
            <Row label="Unrealized">{unrealized == null ? pending : formatSignedThb(unrealized)}</Row>
          </dl>
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

      {analytics.incompleteBasisTrades > 0 && (
        <p className="text-muted-foreground text-xs">
          {analytics.incompleteBasisTrades} sell(s) have no matching buy in your Gmail history (bought before the emails
          start?), so their realized P&L counts the whole sale as profit.
        </p>
      )}
    </div>
  )
}

function StatCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="gap-3">
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
function Delta({ label, change, pending }: { label: string; change?: PeriodChange | null; pending: boolean }) {
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
    <p
      className="flex items-center gap-1.5"
      title="% is the time-weighted return, so money you add or withdraw doesn't count as growth. ฿ is the change in value minus money added."
    >
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
