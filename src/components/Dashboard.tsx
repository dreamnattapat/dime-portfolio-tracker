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
        {lastSynced && <>ซิงก์เมื่อ {formatDateTime(lastSynced)}</>}
        {lastSynced && ' · '}
        {loading ? 'กำลังดึงราคา…' : portfolio?.pricesAsOf ? `ราคา ณ ${formatDateTime(portfolio.pricesAsOf)}` : null}
      </p>

      {error && (
        <p className="text-muted-foreground text-sm">ไม่มีข้อมูลราคา ({error}) จึงแสดงเฉพาะกำไร/ขาดทุนที่รับรู้แล้ว</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <ValueCard portfolio={portfolio} pending={pending} />

        <StatCard label="กำไร/ขาดทุนรวม">
          <p className="text-3xl font-semibold tracking-tight">
            {totalPnl == null ? pending : formatSignedThb(totalPnl)}
          </p>
          <dl className="text-muted-foreground space-y-1 text-sm">
            <Row label="รับรู้แล้ว">{formatSignedThb(analytics.realizedPnlThb)}</Row>
            <Row
              label="ยังไม่รับรู้"
              title={
                uncounted != null && Math.abs(uncounted) >= 1
                  ? `เหมือนในแอป Dime!: ราคาเทียบกับต้นทุนเฉลี่ย ไม่รวม ${formatSignedThb(uncounted)} จากการเปลี่ยนแปลงของค่าเงิน USD/THB และค่าธรรมเนียมการซื้อ`
                  : undefined
              }
            >
              {unrealized == null ? pending : formatSignedThb(unrealized)}
            </Row>
          </dl>
        </StatCard>

        <StatCard label="อัตราชนะ">
          <p className="text-3xl font-semibold tracking-tight">{formatPercent(stats.winRatePct, { decimals: 0 })}</p>
          <p
            className="text-muted-foreground text-sm"
            title={
              WIN_RATE_EXCLUDED.size > 0
                ? `การขายที่ได้กำไร ไม่รวม ${[...WIN_RATE_EXCLUDED].join(', ')} (ที่พักเงินสด)`
                : 'การขายที่ได้กำไร'
            }
          >
            ชนะ {stats.wins} จาก {stats.rated} ครั้ง
          </p>
        </StatCard>
      </div>

      <PayoffCard stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>พอร์ตของคุณเทียบกับ S&P 500</CardTitle>
          <CardDescription title="ลงเงินจำนวนเดียวกัน ในวันเดียวกัน ใน SPY ไม่รวมเงินปันผลและค่าธรรมเนียมฝั่ง S&P 500">
            การซื้อขายของคุณเทียบกับการซื้อขายแบบเดียวกันใน S&P 500 เป็นดอลลาร์สหรัฐ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portfolio ? (
            <>
              <PortfolioChart points={portfolio.timeline.pointsUsd} />
              {portfolio.timeline.approximated.length > 0 && (
                <p className="text-muted-foreground mt-3 text-xs">
                  ไม่มีราคาของ {portfolio.timeline.approximated.join(', ')} จึงใช้ราคาที่คุณซื้อขายล่าสุดแทน
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              {loading ? 'กำลังดึงราคาตลาด…' : 'แสดงกราฟไม่ได้เพราะไม่มีราคาตลาด'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>กำไร/ขาดทุนรายสินทรัพย์</CardTitle>
          <CardDescription>ยอดที่ยังไม่รับรู้ตรงกับในแอป Dime!</CardDescription>
        </CardHeader>
        <CardContent>
          <AssetsTable assets={assets} loading={loading} />
        </CardContent>
      </Card>

      {analytics.incompleteBasisTrades > 0 && (
        <p className="text-muted-foreground text-xs">
          มีรายการขาย {analytics.incompleteBasisTrades} รายการที่ไม่พบรายการซื้อในอีเมลของคุณ
          จึงนับยอดขายทั้งหมดเป็นกำไร
        </p>
      )}
    </div>
  )
}

const TWR_HINT =
  '% คือผลตอบแทนแบบถ่วงน้ำหนักด้วยเวลา (TWR) เงินที่เติมหรือถอนจึงไม่นับเป็นการเติบโต ส่วน ฿ คือมูลค่าที่เปลี่ยนไปหักเงินที่เติมเข้ามา'

function ValueCard({ portfolio, pending }: { portfolio: Portfolio | null; pending: string }) {
  const day = portfolio?.day
  const mood = !day || day.returnPct === 0 ? null : day.returnPct > 0 ? 'up' : 'down'

  return (
    <StatCard label="สินทรัพย์รวม" className="relative">
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
          title={`วันซื้อขายล่าสุดของตลาดสหรัฐฯ${portfolio ? ` (${formatDate(portfolio.timeline.latestSession)})` : ''} เทียบกับราคาปิดก่อนหน้า รวมการเปลี่ยนแปลงของค่าเงิน USD/THB ${TWR_HINT}`}
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

function Row({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4" title={title}>
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
        {label} {pending ? '…' : '— ข้อมูลย้อนหลังไม่พอ'}
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
      <span className="text-muted-foreground tabular-nums">({formatSignedThb(change.gain)})</span>
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
        <CardTitle>อัตราชนะนี้คุ้มไหม?</CardTitle>
        <CardDescription>อัตราชนะที่ต้องมีเพื่อให้คุ้มทุน เมื่อดูจากกำไรเฉลี่ยและขาดทุนเฉลี่ยของคุณ</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {comparable ? (
          <WinRateMeter winRatePct={winRatePct} breakEvenPct={breakEvenWinRatePct} ahead={ahead} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {stats.rated === 0
              ? 'ยังไม่มีการขายปิดสถานะ'
              : stats.losses === 0
                ? 'ยังไม่มีเทรดที่ขาดทุน'
                : 'ยังไม่มีเทรดที่ได้กำไร'}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="กำไรเฉลี่ย" value={formatThb(avgWinThb)} />
          <Metric label="ขาดทุนเฉลี่ย" value={avgLossThb == null ? '—' : formatThb(-avgLossThb)} />
          <Metric
            label="อัตราส่วนกำไรต่อขาดทุน"
            value={payoffRatio == null ? '—' : `${formatNumber(payoffRatio)}×`}
            hint="กำไรเฉลี่ย ÷ ขาดทุนเฉลี่ย"
          />
          <Metric
            label="ค่าคาดหวังต่อเทรด"
            value={formatSignedThb(stats.expectancyThb)}
            hint={
              stats.profitFactor == null
                ? 'กำไร/ขาดทุนเฉลี่ยต่อเทรด'
                : `กำไร/ขาดทุนเฉลี่ยต่อเทรด · Profit factor ${formatNumber(stats.profitFactor)}`
            }
          />
        </dl>
      </CardContent>
    </Card>
  )
}

/** A labelled number; `hint` explains it on hover. */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5" title={hint}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
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
        aria-label={`อัตราชนะ ${Math.round(winRatePct)}%, จุดคุ้มทุน ${Math.round(breakEvenPct)}%`}
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
          อัตราชนะของคุณ {formatPercent(winRatePct, { decimals: 0 })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-foreground h-3 w-0.5 rounded-full" aria-hidden />
          จุดคุ้มทุน {formatPercent(breakEvenPct, { decimals: 0 })}
        </span>
      </div>
    </div>
  )
}
