import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AssetsTable } from '@/components/AssetsTable'
import { PortfolioChart } from '@/components/PortfolioChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { computeAnalytics, WIN_RATE_EXCLUDED, type TradeStats } from '@/lib/analytics'
import { buildPortfolio, scorecard, type PeriodChange, type Portfolio, type Timeline } from '@/lib/benchmark'
import { computeAssetPnl, pnlBreakdown, sumAssets, type Breakdown } from '@/lib/assets'
import { getUsdThbOverride, setUsdThbOverride, type Transaction } from '@/lib/db'
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  localToday,
  type Currency,
} from '@/lib/format'

/** The latest price lookup, and which trades and USD/THB rate it was for. */
type Loaded = { key: string; portfolio: Portfolio | null; error: string | null }

export function Dashboard({
  transactions,
  hideAmounts,
  currency,
  onTimeline,
}: {
  transactions: Transaction[]
  hideAmounts: boolean
  /** Shares the latest valuation (e.g. for the Excel export). */
  onTimeline?: (timeline: Timeline | null) => void
  /** ฿: what it's worth in baht, exchange-rate moves included. $: exact, straight from the confirmations. */
  currency: Currency
}) {
  const asTraded = useMemo(() => computeAnalytics(transactions), [transactions])
  // The database emits a new array on every write (many per sync); only
  // refetch prices when the trades themselves change.
  const flowsKey = JSON.stringify(asTraded.cashFlows)
  const [usdThbOverride, setOverride] = useState(getUsdThbOverride)
  const key = `${flowsKey}|${usdThbOverride ?? ''}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  function changeUsdThb(rate: number | null) {
    setUsdThbOverride(rate)
    setOverride(rate)
  }

  useEffect(() => {
    let cancelled = false
    const done = (portfolio: Portfolio | null, error: string | null) => {
      if (!cancelled) setLoaded({ key, portfolio, error })
    }
    // Wait for a sync to settle rather than refetching after every email.
    const timer = setTimeout(() => {
      buildPortfolio(JSON.parse(flowsKey), localToday(), usdThbOverride)
        .then((portfolio) => done(portfolio, null))
        .catch((e: Error) => done(null, e.message))
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, flowsKey, usdThbOverride])

  const loading = loaded?.key !== key
  // While trades change, keep showing the previous figures until the new ones are ready.
  const portfolio = loaded?.portfolio ?? null
  const error = loading ? null : (loaded?.error ?? null)
  const pending = loading ? '…' : '—'
  useEffect(() => {
    onTimeline?.(portfolio?.timeline ?? null)
  }, [portfolio, onTimeline])

  // Once prices are in, recount units across any stock splits since they were bought.
  const splits = portfolio?.timeline.splits
  const analytics = useMemo(
    () => (splits && Object.keys(splits).length ? computeAnalytics(transactions, splits) : asTraded),
    [transactions, splits, asTraded],
  )
  const usd = currency === '$'
  const assets = useMemo(
    () => computeAssetPnl(analytics, portfolio?.timeline ?? null, currency),
    [analytics, portfolio, currency],
  )
  const realized = usd ? analytics.realizedPnlUsd : analytics.realizedPnlThb
  const unrealized = sumAssets(assets, (a) => a.unrealized)
  // The headline is the actual gain: value now, minus money put in, plus money taken out. It's what the
  // chart's ทั้งหมด shows. Realized + unrealized is how the Dime! app counts it, from the average cost;
  // the rest is the buy fees average cost leaves out and, in baht, the USD/THB move.
  const totalPnl = portfolio ? (usd ? portfolio.totalGainUsd : portfolio.totalGainThb) : null
  const breakdown =
    totalPnl != null && unrealized != null
      ? pnlBreakdown(totalPnl, realized, unrealized, -(usd ? analytics.buyFeesUsd : analytics.buyFeesThb), currency)
      : null
  const { stats } = analytics

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-muted-foreground text-sm">ไม่มีข้อมูลราคา ({error}) จึงแสดงเฉพาะกำไร/ขาดทุนที่รับรู้แล้ว</p>
      )}

      <SummaryCard
        portfolio={portfolio}
        loading={loading}
        pending={pending}
        totalPnl={totalPnl}
        realized={realized}
        unrealized={unrealized}
        breakdown={breakdown}
        stats={stats}
        tradeCount={transactions.length}
        onChangeUsdThb={changeUsdThb}
        currency={currency}
      />

      <Card>
        <CardHeader>
          <CardTitle>พอร์ตของคุณเทียบกับ S&P 500</CardTitle>
          <CardDescription title="ลงเงินจำนวนเดียวกัน ในวันเดียวกัน ใน SPY ไม่รวมเงินปันผลและค่าธรรมเนียมฝั่ง S&P 500">
            การซื้อขายของคุณเทียบกับการซื้อขายแบบเดียวกันใน S&P 500 {usd ? 'เป็นดอลลาร์สหรัฐ' : 'เป็นเงินบาท'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portfolio ? (
            <>
              <PortfolioChart
                points={usd ? portfolio.timeline.pointsUsd : portfolio.timeline.points}
                latestSession={portfolio.timeline.latestSession}
                currency={currency}
                hideAmounts={hideAmounts}
              />
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
          <AssetsTable assets={assets} loading={loading} currency={currency} />
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
            คิดจากต้นทุนเฉลี่ยแบบแอป Dime! จึงยังไม่รวมค่าธรรมเนียมตอนซื้อ{usd ? '' : 'และผลจากค่าเงิน USD/THB'}{' '}
            ซึ่งแสดงแยกไว้ในภาพรวมพอร์ต
          </p>
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
  '% คือผลตอบแทนแบบถ่วงน้ำหนักด้วยเวลา (TWR) เงินที่เติมหรือถอนจึงไม่นับเป็นการเติบโต ส่วนจำนวนเงินคือมูลค่าที่เปลี่ยนไปหักเงินที่เติมเข้ามา'

/** The headline numbers in one card, stamped with how the portfolio did against the S&P 500. */
function SummaryCard({
  portfolio,
  loading,
  pending,
  totalPnl,
  realized,
  unrealized,
  breakdown,
  stats,
  tradeCount,
  onChangeUsdThb,
  currency,
}: {
  portfolio: Portfolio | null
  loading: boolean
  pending: string
  totalPnl: number | null
  realized: number
  unrealized: number | null
  breakdown: Breakdown | null
  stats: TradeStats
  tradeCount: number
  onChangeUsdThb: (rate: number | null) => void
  currency: Currency
}) {
  const usd = currency === '$'
  const day = usd ? portfolio?.dayUsd : portfolio?.day
  // The stamp agrees with the chart's ทั้งหมด scorecard in the same currency.
  const score = portfolio ? scorecard(usd ? portfolio.timeline.pointsUsd : portfolio.timeline.points, null) : null
  const signed = (value: number | null) => formatSignedMoney(value, currency)

  return (
    <Card className="gap-0 px-6">
      <section aria-label="ภาพรวมพอร์ต">
        <header>
          <h2 className="font-display text-lg leading-snug font-medium">ภาพรวมพอร์ต</h2>
          <p className="text-muted-foreground text-xs">
            {loading
              ? 'กำลังดึงราคา…'
              : portfolio?.pricesAsOf
                ? `ราคา ณ ${formatDateTime(portfolio.pricesAsOf)}`
                : portfolio
                  ? `ราคาปิด ${formatDate(portfolio.timeline.latestSession)}`
                  : 'ไม่มีราคาตลาด'}
          </p>
        </header>

        <div className="my-5 border-t" aria-hidden />

        <div className="lg:grid lg:grid-cols-2 lg:gap-12">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">สินทรัพย์รวม</p>
            <p className="font-display text-4xl font-medium tabular-nums">
              {portfolio ? formatMoney(usd ? portfolio.valueUsd : portfolio.valueThb, currency) : pending}
            </p>
            <div className="space-y-1 pt-1 text-sm">
              <Delta
                label="1D"
                change={day}
                pending={!portfolio}
                currency={currency}
                title={`วันซื้อขายล่าสุดของตลาดสหรัฐฯ${portfolio ? ` (${formatDate(portfolio.timeline.latestSession)})` : ''} เทียบกับราคาปิดก่อนหน้า${usd ? '' : ' รวมการเปลี่ยนแปลงของค่าเงิน USD/THB'} ${TWR_HINT}`}
              />
              <Delta
                label="MoM"
                change={usd ? portfolio?.momUsd : portfolio?.mom}
                pending={!portfolio}
                currency={currency}
                title={TWR_HINT}
              />
              <Delta
                label="YoY"
                change={usd ? portfolio?.yoyUsd : portfolio?.yoy}
                pending={!portfolio}
                currency={currency}
                title={TWR_HINT}
              />
            </div>
          </div>

          <div className="my-5 border-t lg:hidden" aria-hidden />

          <dl className="space-y-2 self-center text-sm">
            <SlipRow
              label="กำไร/ขาดทุนรวม"
              strong
              value={totalPnl == null ? pending : signed(breakdown?.total ?? totalPnl)}
              tone={totalPnl}
              title="มูลค่าตอนนี้ บวกเงินที่ได้จากการขาย หักเงินที่ใช้ซื้อทั้งหมด เท่ากับยอดทั้งหมดในกราฟ"
            />
            <SlipRow
              label="รับรู้แล้ว"
              indent
              value={signed(breakdown?.realized ?? realized)}
              title="จากหุ้นที่ขายแล้ว: ยอดรับสุทธิเทียบกับต้นทุนเฉลี่ย (ไม่รวมค่าธรรมเนียมตอนซื้อ)"
            />
            <SlipRow
              label="ยังไม่รับรู้"
              indent
              value={unrealized == null ? pending : signed(breakdown?.unrealized ?? unrealized)}
              title="เหมือนในแอป Dime!: ราคาตอนนี้เทียบกับต้นทุนเฉลี่ย"
            />
            {breakdown && breakdown.buyFees !== 0 && (
              <SlipRow
                label="ค่าธรรมเนียมตอนซื้อ"
                note="ไม่อยู่ในต้นทุนเฉลี่ย"
                indent
                value={signed(breakdown.buyFees)}
                title="ค่าคอมมิชชันและ VAT ตอนซื้อทุกรายการ ต้นทุนเฉลี่ยในแอป Dime! ไม่รวมส่วนนี้ จึงไม่อยู่ในกำไร/ขาดทุนสองบรรทัดบน"
              />
            )}
            {breakdown && breakdown.fx !== 0 && (
              <SlipRow
                label="จากค่าเงิน USD/THB"
                note="แอป Dime! ไม่นับ"
                indent
                value={signed(breakdown.fx)}
                title="ค่าเงินบาทที่เปลี่ยนไประหว่างวันที่ซื้อกับวันที่ขาย (หรือวันนี้ สำหรับหุ้นที่ยังถืออยู่) แอป Dime! คิดกำไรเป็นดอลลาร์แล้วแปลงด้วยเรทปัจจุบัน จึงไม่นับส่วนนี้"
              />
            )}
            <SlipRow
              label="อัตราชนะ"
              strong
              value={`${formatPercent(stats.winRatePct, { decimals: 0 })} (ชนะ ${stats.wins} จาก ${stats.rated})`}
              title={
                WIN_RATE_EXCLUDED.size > 0
                  ? `การขายที่ได้กำไร ไม่รวม ${[...WIN_RATE_EXCLUDED].join(', ')} (ที่พักเงินสด)`
                  : 'การขายที่ได้กำไร'
              }
            />
          </dl>
        </div>

        <div className="my-5 border-t" aria-hidden />

        <footer className="flex items-center gap-4">
          {/* Only stock trades come in by email, so cash held elsewhere in Dime! can't be counted. */}
          <div className="text-muted-foreground flex-1 space-y-1 text-xs leading-relaxed">
            <p>จาก {tradeCount} รายการในอีเมล</p>
            <p>ไม่รวมเงินใน Dime! Save, บัญชี FCD และเงินสด USD</p>
          </div>
          {score && <Stamp leadPct={score.leadPct} />}
        </footer>
        {portfolio && (
          <div className="text-muted-foreground mt-4 text-xs leading-relaxed">
            {usd ? (
              <p>ยอด USD ตรงกับใบยืนยันการซื้อขายและแอป Dime! ไม่ขึ้นกับอัตราแลกเปลี่ยน</p>
            ) : (
              <UsdThbSetting portfolio={portfolio} onChange={onChangeUsdThb} />
            )}
          </div>
        )}
      </section>
    </Card>
  )
}

/**
 * The USD/THB rate the values use, and a way to swap the market rate for
 * Dime!'s own (which sits a little below it), so totals match the app.
 */
function UsdThbSetting({ portfolio, onChange }: { portfolio: Portfolio; onChange: (rate: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const rate = portfolio.timeline.usdThb
  const parsed = Number(draft)
  const valid = draft !== '' && parsed >= 20 && parsed <= 60

  if (editing) {
    return (
      <form
        className="space-y-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          onChange(parsed)
          setEditing(false)
        }}
      >
        <label className="block space-y-1">
          <span className="text-foreground font-medium">เรทของ Dime! (บาทต่อ 1 ดอลลาร์)</span>
          <Input
            className="h-9 w-32 text-sm tabular-nums"
            inputMode="decimal"
            autoFocus
            placeholder={formatNumber(rate, 2)}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
          />
        </label>
        <p>หาได้จากแอป Dime!: เอามูลค่าเป็นบาทของหุ้นตัวไหนก็ได้ หารด้วยมูลค่าเป็น USD เช่น 33,420 ÷ 1,000 = 33.42</p>
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            className="bg-brand hover:bg-brand/90 rounded-full text-white"
            disabled={!valid}
          >
            ใช้เรทนี้
          </Button>
          <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setEditing(false)}>
            ยกเลิก
          </Button>
        </div>
      </form>
    )
  }

  return (
    <p>
      เรท {formatNumber(rate, 2)} บาท/ดอลลาร์{' '}
      {portfolio.usdThbOverridden
        ? `(เรทที่คุณตั้ง ราคาตลาด ${formatNumber(portfolio.marketUsdThb, 2)})`
        : '(ราคาตลาด)'}{' '}
      <button
        type="button"
        className="text-brand font-medium underline-offset-2 hover:underline"
        onClick={() => {
          setDraft(portfolio.usdThbOverridden ? String(rate) : '')
          setEditing(true)
        }}
      >
        {portfolio.usdThbOverridden ? 'แก้เรท' : 'ใช้เรทของ Dime!'}
      </button>
      {portfolio.usdThbOverridden && (
        <>
          {' · '}
          <button
            type="button"
            className="text-brand font-medium underline-offset-2 hover:underline"
            onClick={() => onChange(null)}
          >
            ใช้ราคาตลาด
          </button>
        </>
      )}
    </p>
  )
}

function SlipRow({
  label,
  value,
  title,
  note,
  strong = false,
  indent = false,
  tone,
}: {
  label: string
  value: string
  title?: string
  /** A small second line under the label. */
  note?: string
  strong?: boolean
  indent?: boolean
  /** Colors the value by sign. */
  tone?: number | null
}) {
  const color = tone == null || tone === 0 ? '' : tone > 0 ? 'text-delta-up' : 'text-delta-down'
  return (
    <div className={`flex justify-between gap-4 ${indent ? 'text-muted-foreground pl-3' : ''}`} title={title}>
      <dt className={strong ? 'font-medium' : undefined}>
        {label}
        {note && <span className="text-muted-foreground block text-xs">{note}</span>}
      </dt>
      <dd className={`tabular-nums ${strong ? 'text-base font-semibold' : 'text-foreground'} ${color}`}>{value}</dd>
    </div>
  )
}

/** Ahead of, behind or even with the S&P 500 over all time, as a rubber stamp. */
function Stamp({ leadPct }: { leadPct: number }) {
  const even = Math.abs(leadPct) < 0.05
  const ahead = leadPct > 0
  return (
    <div
      className={`stamp shrink-0 ${even ? 'text-muted-foreground' : ahead ? 'text-delta-up' : 'text-delta-down'}`}
      title="ผลตอบแทนทั้งหมดของคุณ เทียบกับการซื้อขายแบบเดียวกันใน S&P 500"
    >
      <span className="text-[0.65rem] font-medium">ส่องพอร์ต Dime</span>
      <span className="text-base leading-tight font-semibold">{even ? 'สูสี' : ahead ? 'ชนะ' : 'แพ้'} S&P 500</span>
      {!even && (
        <span className="text-xs font-semibold tabular-nums">
          {ahead ? 'นำ' : 'ตาม'} {formatPercent(Math.abs(leadPct))}
        </span>
      )}
    </div>
  )
}

/** A period's return with an arrow, so direction never relies on color alone. */
function Delta({
  label,
  change,
  pending,
  title,
  currency,
}: {
  label: string
  change?: PeriodChange | null
  pending: boolean
  title: string
  currency: Currency
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
      <span className="text-muted-foreground tabular-nums">({formatSignedMoney(change.gain, currency)})</span>
    </p>
  )
}
