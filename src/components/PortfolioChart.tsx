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
import { ArrowDownRight, ArrowUpRight, Check, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { changeBetween, monthsBefore, rangeStart, scorecard, type TimelinePoint } from '@/lib/benchmark'
import { formatCompactMoney, formatDate, formatMoney, formatPercent, formatSignedMoney } from '@/lib/format'

const LINES = {
  you: { color: '--series-you', dashed: false },
  spy: { color: '--series-spy', dashed: false },
  invested: { color: '--series-invested', dashed: true },
} as const

type LineKey = keyof typeof LINES
/** `of` gives a line's value on day `p`; `base` is the first day of the selected range. */
type SeriesDef = { key: LineKey; label: string; of: (p: TimelinePoint, base: TimelinePoint) => number }

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

// Gain first: "am I beating the S&P 500?" is the chart's main question.
const VIEWS: Record<'gain' | 'value', { label: string; series: SeriesDef[] }> = {
  gain: {
    label: 'Gain',
    series: [
      { key: 'you', label: 'Your gain', of: gainSince((p) => p.value) },
      { key: 'spy', label: 'Gain with the S&P 500', of: gainSince((p) => p.spy) },
    ],
  },
  value: {
    label: 'Value',
    series: [
      { key: 'you', label: 'Your portfolio', of: (p) => p.value },
      { key: 'spy', label: 'Same trades in the S&P 500', of: (p) => p.spy },
      { key: 'invested', label: 'Net invested', of: (p) => p.invested },
    ],
  },
}

const RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '1Y', months: 12 },
  { label: 'All', months: null },
] as const

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Your portfolio vs the S&P 500 mirror, day by day. Expects USD points. */
export function PortfolioChart({ points }: { points: TimelinePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<Map<LineKey, ISeriesApi<'Line'>>>(new Map())
  const [hovered, setHovered] = useState<number | null>(null)
  const [range, setRange] = useState<string>('All')
  const [view, setView] = useState<keyof typeof VIEWS>('gain')
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
      localization: { priceFormatter: (value: number) => formatCompactMoney(value, '$') },
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

  const months = RANGES.find((r) => r.label === range)?.months
  // A range longer than the history shows all of it.
  const start = Math.max(0, rangeStart(points, months ?? null))
  const base = points[start]

  useEffect(() => {
    if (!base) return
    for (const [key, line] of seriesRef.current) {
      const def = VIEWS[view].series.find((s) => s.key === key)
      line.applyOptions({ visible: !!def })
      line.setData(def ? points.map((p) => ({ time: p.date as Time, value: def.of(p, base) })) : [])
    }
  }, [points, view, base])

  useEffect(() => {
    const chart = chartRef.current
    const last = points.at(-1)
    if (!chart || !last) return
    if (months == null || points[0].date > monthsBefore(last.date, months)) chart.timeScale().fitContent()
    else chart.timeScale().setVisibleRange({ from: monthsBefore(last.date, months) as Time, to: last.date as Time })
  }, [points, months, view])

  // The readout covers the selected range, up to the hovered day or the latest.
  const end = hovered ?? points.length - 1
  const shown = points[end]
  const monthEnds = points.filter(
    (p, i) => i >= start && (i === points.length - 1 || points[i + 1].date.slice(0, 7) !== p.date.slice(0, 7)),
  )
  const money = view === 'gain' ? formatSignedMoney : formatMoney

  return (
    <div className="space-y-3">
      <Scorecards points={points} selected={range} onSelect={setRange} />
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
              <dd className="text-sm font-semibold tabular-nums">{shown ? money(s.of(shown, base), '$') : '—'}</dd>
              <dd className="text-xs">
                <RangeChange points={points} start={start} end={end} line={s.key} showAmount={view === 'value'} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex gap-4">
          <div className="flex gap-1" role="group" aria-label="Show">
            {Object.entries(VIEWS).map(([key, v]) => (
              <Button
                key={key}
                size="xs"
                variant={view === key ? 'secondary' : 'ghost'}
                aria-pressed={view === key}
                onClick={() => setView(key as keyof typeof VIEWS)}
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
        <summary className="text-muted-foreground cursor-pointer text-xs">Show table</summary>
        <div className="mt-2 max-h-80 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
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
                      {money(s.of(p, base), '$')}
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
  showAmount,
}: {
  points: TimelinePoint[]
  start: number
  end: number
  line: LineKey
  /** Off in the gain view, where the amount is already the big number. */
  showAmount: boolean
}) {
  const valueOf = VALUE_OF[line]
  if (start >= end) return <span className="text-muted-foreground">—</span>
  if (!valueOf) {
    const added = points[end].invested - points[start].invested
    return (
      <span className="text-muted-foreground tabular-nums">
        {Math.abs(added) < 1
          ? 'No money added'
          : added > 0
            ? `${formatMoney(added, '$')} added`
            : `${formatMoney(-added, '$')} taken out`}
      </span>
    )
  }
  const change = changeBetween(points, start, end, valueOf)
  if (!change) return <span className="text-muted-foreground">—</span>
  const up = change.returnPct >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex items-center gap-1">
      <span className={`flex items-center font-medium ${up ? 'text-delta-up' : 'text-delta-down'}`}>
        <Arrow className="size-3.5" aria-hidden />
        {formatPercent(change.returnPct, { signed: true })}
      </span>
      {showAmount && (
        <span className="text-muted-foreground tabular-nums">({formatSignedMoney(change.gain, '$')})</span>
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Time range">
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
                  <dt className="text-muted-foreground">You</dt>
                  <dd className="tabular-nums">{formatPercent(score.youPct, { signed: true })}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">S&P 500</dt>
                  <dd className="tabular-nums">{formatPercent(score.spyPct, { signed: true })}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground mt-2 text-xs">Not enough history yet</p>
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
    return <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs font-medium">Even</span>
  }
  const ahead = leadPct > 0
  const Icon = ahead ? Check : X
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${ahead ? 'bg-delta-up/10 text-delta-up' : 'bg-delta-down/10 text-delta-down'}`}
    >
      <Icon className="size-3" aria-hidden />
      {ahead ? 'Ahead' : 'Behind'} by {formatPercent(Math.abs(leadPct))}
    </span>
  )
}
