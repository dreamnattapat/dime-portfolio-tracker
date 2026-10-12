import {
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { ArrowDownRight, ArrowUpRight, Check, Play, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  changeBetween,
  cumulativeReturns,
  monthsBefore,
  rangeStart,
  scorecard,
  type TimelinePoint,
} from '@/lib/benchmark'
import {
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type Currency,
} from '@/lib/format'

const LINES = {
  you: { color: '--series-you', dashed: false },
  spy: { color: '--series-spy', dashed: false },
  invested: { color: '--series-invested', dashed: true },
} as const

type LineKey = keyof typeof LINES
/** Each line's running time-weighted return since the start of the selected range, by point index. */
type Cumulative = { you: (number | null)[]; spy: (number | null)[] }
/**
 * `of` gives a line's value on day `p` (index `i`); `base` is the first day of
 * the selected range. Null means no value yet (before the range, in the % view).
 */
type SeriesDef = {
  key: LineKey
  label: string
  of: (p: TimelinePoint, base: TimelinePoint, i: number, cum: Cumulative) => number | null
}

// Each line's change over the selected range. Your portfolio and the mirror
// count gain only, not money added (the same in both views); net invested
// shows the money added or taken out.
const VALUE_OF: Partial<Record<LineKey, (p: TimelinePoint) => number>> = {
  you: (p) => p.value,
  spy: (p) => p.spy,
}

// Value dips whenever holdings are sold to cash; gain (value minus net
// invested) doesn't, so it shows the gap to the S&P 500 more clearly. Gain
// starts from 0 at the beginning of the selected range, so the lines show who
// gained more in that range rather than everything since the first trade.
const gainSince = (value: (p: TimelinePoint) => number) => (p: TimelinePoint, base: TimelinePoint) =>
  value(p) - p.invested - (value(base) - base.invested)

// % first: one return line each, like the S&P 500 comparisons people share.
// Time-weighted, so money added or taken out doesn't count, and the S&P 500
// line works out to SPY's own return over the range.
const VIEWS: Record<'pct' | 'gain' | 'value', { label: string; series: SeriesDef[] }> = {
  pct: {
    label: '%',
    series: [
      { key: 'you', label: 'ผลตอบแทนของคุณ', of: (_p, _b, i, cum) => cum.you[i] },
      { key: 'spy', label: 'S&P 500', of: (_p, _b, i, cum) => cum.spy[i] },
    ],
  },
  gain: {
    label: 'กำไร',
    series: [
      { key: 'you', label: 'กำไรของคุณ', of: gainSince((p) => p.value) },
      { key: 'spy', label: 'กำไรถ้าลงทุนใน S&P 500', of: gainSince((p) => p.spy) },
    ],
  },
  value: {
    label: 'มูลค่า',
    series: [
      { key: 'you', label: 'พอร์ตของคุณ', of: (p) => p.value },
      { key: 'spy', label: 'ซื้อขายแบบเดียวกันใน S&P 500', of: (p) => p.spy },
      { key: 'invested', label: 'เงินลงทุนสุทธิ', of: (p) => p.invested },
    ],
  },
}

const RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '1Y', months: 12 },
  { label: 'ทั้งหมด', months: null },
] as const

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Your portfolio vs the S&P 500 mirror, day by day, in baht (USD/THB moves included) or USD. */
export function PortfolioChart({
  points,
  currency,
  hideAmounts,
}: {
  points: TimelinePoint[]
  currency: Currency
  hideAmounts: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<Map<LineKey, ISeriesApi<'Line'>>>(new Map())
  const [hovered, setHovered] = useState<number | null>(null)
  const [range, setRange] = useState<string>('ทั้งหมด')
  const [view, setView] = useState<keyof typeof VIEWS>('pct')
  // The replay: the last point index drawn while the lines grow to today, or null.
  const [replay, setReplay] = useState<number | null>(null)
  const replayFrame = useRef<number | null>(null)
  const { series } = VIEWS[view]
  const byDate = useMemo(() => new Map(points.map((p, i) => [p.date, i])), [points])
  // The crosshair handler is set up once, so it reads the latest points through a ref.
  const byDateRef = useRef(byDate)
  useEffect(() => {
    byDateRef.current = byDate
  }, [byDate])

  useEffect(() => {
    const seriesByKey = seriesRef.current
    const chart = createChart(containerRef.current!, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: cssVar('--chart-axis-text'),
        fontFamily: getComputedStyle(document.body).fontFamily,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--chart-grid') } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
      // Gregorian years on the axis, as everywhere else on the page. The price
      // format follows the currency and "hide amounts", so it's set by the effect below.
      localization: { locale: 'th-TH-u-ca-gregory' },
      handleScroll: false,
      handleScale: false,
    })
    for (const [key, line] of Object.entries(LINES)) {
      seriesByKey.set(
        key as LineKey,
        chart.addSeries(LineSeries, {
          color: cssVar(line.color),
          lineWidth: 2,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 4,
        }),
      )
    }
    chart.subscribeCrosshairMove((param) =>
      setHovered(param.time ? (byDateRef.current.get(String(param.time)) ?? null) : null),
    )
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
      seriesByKey.clear()
    }
  }, [])

  // The axis labels are drawn by the chart, not React: redraw them when the
  // view, the currency or "hide amounts" changes. Percentages are never hidden.
  useEffect(() => {
    chartRef.current?.applyOptions({
      localization: {
        locale: 'th-TH-u-ca-gregory',
        priceFormatter: (value: number) =>
          view === 'pct' ? `${Math.round(value)}%` : formatCompactMoney(value, currency),
      },
    })
  }, [hideAmounts, currency, view])

  const months = RANGES.find((r) => r.label === range)?.months
  // A range longer than the history shows all of it.
  const start = Math.max(0, rangeStart(points, months ?? null))
  const base = points[start]
  const cum = useMemo<Cumulative>(
    () => ({ you: cumulativeReturns(points, start), spy: cumulativeReturns(points, start, (p) => p.spy) }),
    [points, start],
  )

  useEffect(() => {
    if (!base) return
    for (const [key, line] of seriesRef.current) {
      const def = VIEWS[view].series.find((s) => s.key === key)
      line.applyOptions({ visible: !!def })
      line.setData(
        def
          ? points.map((p, i) => {
              // Days before the range (% view) or not yet reached by the replay stay empty.
              const value = replay != null && i > replay ? null : def.of(p, base, i, cum)
              return value == null ? { time: p.date as Time } : { time: p.date as Time, value }
            })
          : [],
      )
    }
    // Show the selected range, from its first day to today, whatever has been drawn so far.
    // (Left alone, the chart scrolls to the last day with a value, which mid-replay is near the start.)
    const last = points.at(-1)
    const chart = chartRef.current
    if (chart && last) {
      const from =
        months == null
          ? 0
          : Math.max(
              0,
              points.findIndex((p) => p.date >= monthsBefore(last.date, months)),
            )
      chart.timeScale().setVisibleLogicalRange({ from, to: points.length - 1 })
    }
  }, [points, view, base, cum, replay, months])

  function stopReplay() {
    if (replayFrame.current != null) cancelAnimationFrame(replayFrame.current)
    replayFrame.current = null
    setReplay(null)
  }

  /** Grows the lines from the start of the range to today, like a screen-recordable replay. */
  function startReplay() {
    stopReplay()
    const last = points.length - 1
    if (start >= last) return
    // About 8 seconds for a long history, quicker for a short one.
    const duration = Math.min(8000, Math.max(3000, (last - start) * 12))
    const began = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration)
      setReplay(start + Math.round(t * (last - start)))
      if (t < 1) replayFrame.current = requestAnimationFrame(step)
      else {
        replayFrame.current = null
        // Hold the finished picture briefly, then hand back to normal hovering.
        setTimeout(() => setReplay((r) => (r === last ? null : r)), 1500)
      }
    }
    setReplay(start)
    replayFrame.current = requestAnimationFrame(step)
  }

  // Leaving the page ends any replay; choosing a range or view does too (below).
  useEffect(
    () => () => {
      if (replayFrame.current != null) cancelAnimationFrame(replayFrame.current)
    },
    [],
  )

  // The readout covers the selected range, up to the replayed, hovered or latest day.
  const end = replay ?? hovered ?? points.length - 1
  const shown = points[end]
  const monthEnds = points.filter(
    (p, i) => i >= start && (i === points.length - 1 || points[i + 1].date.slice(0, 7) !== p.date.slice(0, 7)),
  )
  const money = view === 'gain' ? formatSignedMoney : formatMoney
  /** One line's value for the readout and table: % in the % view, money otherwise. */
  const display = (s: SeriesDef, p: TimelinePoint, i: number) => {
    const value = s.of(p, base, i, cum)
    if (value == null) return '—'
    return view === 'pct' ? formatPercent(value, { signed: true }) : money(value, currency)
  }

  return (
    <div className="space-y-3">
      <Scorecards
        points={points}
        selected={range}
        onSelect={(r) => {
          stopReplay()
          setRange(r)
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Legend and readout in one: values for the hovered day, or the latest. */}
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {series.map((s) => (
            <div key={s.key} className="space-y-0.5">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <svg width="16" height="4" aria-hidden className="shrink-0">
                  <line
                    x1="1"
                    y1="2"
                    x2="15"
                    y2="2"
                    stroke={`var(${LINES[s.key].color})`}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={LINES[s.key].dashed ? '3 3' : undefined}
                  />
                </svg>
                {s.label}
              </dt>
              <dd className="text-sm font-semibold tabular-nums">{shown ? display(s, shown, end) : '—'}</dd>
              <dd className="text-xs">
                <RangeChange
                  points={points}
                  start={start}
                  end={end}
                  line={s.key}
                  show={view === 'pct' ? 'amount' : view === 'value' ? 'both' : 'pct'}
                  currency={currency}
                />
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            className="rounded-full"
            onClick={replay == null ? startReplay : stopReplay}
            disabled={start >= points.length - 1}
          >
            {replay == null ? <Play aria-hidden /> : <Square aria-hidden />}
            {replay == null ? 'เล่นย้อนหลัง' : 'หยุด'}
          </Button>
          <div className="flex gap-1" role="group" aria-label="แสดง">
            {Object.entries(VIEWS).map(([key, v]) => (
              <Button
                key={key}
                size="xs"
                variant={view === key ? 'secondary' : 'ghost'}
                aria-pressed={view === key}
                onClick={() => {
                  stopReplay()
                  setView(key as keyof typeof VIEWS)
                }}
              >
                {v.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {shown && start < end
          ? `${formatDate(points[start].date)} – ${formatDate(shown.date)}`
          : formatDate(shown?.date)}
      </p>
      <div ref={containerRef} className="h-72 w-full" />
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer text-xs">แสดงตาราง</summary>
        <div className="mt-2 max-h-80 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                {series.map((s) => (
                  <TableHead key={s.key} className="text-right">
                    {s.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthEnds.toReversed().map((p) => (
                <TableRow key={p.date}>
                  <TableCell>{formatDate(p.date)}</TableCell>
                  {series.map((s) => (
                    <TableCell key={s.key} className="text-right tabular-nums">
                      {display(s, p, byDate.get(p.date) ?? 0)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  )
}

/** How one line changed from points[start] to points[end]. */
function RangeChange({
  points,
  start,
  end,
  line,
  show,
  currency,
}: {
  points: TimelinePoint[]
  start: number
  end: number
  line: LineKey
  /** What isn't already the big number above it: the %, the amount, or both. */
  show: 'pct' | 'amount' | 'both'
  currency: Currency
}) {
  const valueOf = VALUE_OF[line]
  if (start >= end) return <span className="text-muted-foreground">—</span>
  if (!valueOf) {
    const added = points[end].invested - points[start].invested
    return (
      <span className="text-muted-foreground tabular-nums">
        {Math.abs(added) < 1
          ? 'ไม่มีเงินเติมเข้า'
          : added > 0
            ? `เติมเข้า ${formatMoney(added, currency)}`
            : `ถอนออก ${formatMoney(-added, currency)}`}
      </span>
    )
  }
  const change = changeBetween(points, start, end, valueOf)
  if (!change) return <span className="text-muted-foreground">—</span>
  const up = change.returnPct >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex items-center gap-1">
      {show !== 'amount' && (
        <span className={`flex items-center font-medium ${up ? 'text-delta-up' : 'text-delta-down'}`}>
          <Arrow className="size-3.5" aria-hidden />
          {formatPercent(change.returnPct, { signed: true })}
        </span>
      )}
      {show !== 'pct' && (
        <span className="text-muted-foreground tabular-nums">
          {show === 'both' ? `(${formatSignedMoney(change.gain, currency)})` : formatSignedMoney(change.gain, currency)}
        </span>
      )}
    </span>
  )
}

/** "Am I beating the S&P 500?" for each range; each card also selects that range for the chart. */
function Scorecards({
  points,
  selected,
  onSelect,
}: {
  points: TimelinePoint[]
  selected: string
  onSelect: (range: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="ช่วงเวลา">
      {RANGES.map((r) => {
        const score = scorecard(points, r.months)
        const active = selected === r.label
        return (
          <button
            key={r.label}
            className={`hover:bg-accent rounded-lg border p-3 text-left transition-colors ${active ? 'border-foreground/30 bg-accent' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(r.label)}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-sm font-semibold">{r.label}</span>
              {score && <Verdict leadPct={score.leadPct} />}
            </div>
            {score ? (
              <dl className="mt-2 space-y-0.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">คุณ</dt>
                  <dd className="tabular-nums">{formatPercent(score.youPct, { signed: true })}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">S&P 500</dt>
                  <dd className="tabular-nums">{formatPercent(score.spyPct, { signed: true })}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground mt-2 text-xs">ข้อมูลย้อนหลังยังไม่พอ</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Ahead / behind the S&P 500, with an icon so it never relies on color alone. */
function Verdict({ leadPct }: { leadPct: number }) {
  if (Math.abs(leadPct) < 0.05) {
    return <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs font-medium">เสมอ</span>
  }
  const ahead = leadPct > 0
  const Icon = ahead ? Check : X
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${ahead ? 'bg-delta-up/10 text-delta-up' : 'bg-delta-down/10 text-delta-down'}`}
    >
      <Icon className="size-3" aria-hidden />
      {ahead ? 'นำ' : 'ตามหลัง'} {formatPercent(Math.abs(leadPct))}
    </span>
  )
}
