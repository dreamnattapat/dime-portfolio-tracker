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
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { monthsBefore, type TimelinePoint } from '@/lib/benchmark'
import { formatCompactThb, formatDate, formatThb } from '@/lib/format'

const LINES = {
  you: { color: '--series-you', dashed: false },
  spy: { color: '--series-spy', dashed: false },
  invested: { color: '--series-invested', dashed: true },
} as const

type LineKey = keyof typeof LINES
type SeriesDef = { key: LineKey; label: string; of: (p: TimelinePoint) => number }

// Value dips whenever holdings are sold to cash; gain (value minus net
// invested) doesn't, so it shows the gap to the S&P 500 more clearly.
const VIEWS: Record<'value' | 'gain', { label: string; series: SeriesDef[] }> = {
  value: {
    label: 'Value',
    series: [
      { key: 'you', label: 'Your portfolio', of: (p) => p.value },
      { key: 'spy', label: 'Same trades in the S&P 500', of: (p) => p.spy },
      { key: 'invested', label: 'Net invested', of: (p) => p.invested },
    ],
  },
  gain: {
    label: 'Gain',
    series: [
      { key: 'you', label: 'Your gain', of: (p) => p.value - p.invested },
      { key: 'spy', label: 'Gain with the S&P 500', of: (p) => p.spy - p.invested },
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

/** Your portfolio vs the S&P 500 mirror, day by day. */
export function PortfolioChart({ points }: { points: TimelinePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<Map<LineKey, ISeriesApi<'Line'>>>(new Map())
  const [hovered, setHovered] = useState<TimelinePoint | null>(null)
  const [range, setRange] = useState<string>('All')
  const [view, setView] = useState<keyof typeof VIEWS>('value')
  const { series } = VIEWS[view]
  const byDate = useMemo(() => new Map(points.map((p) => [p.date, p])), [points])
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
      localization: { priceFormatter: formatCompactThb },
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

  useEffect(() => {
    for (const [key, line] of seriesRef.current) {
      const def = VIEWS[view].series.find((s) => s.key === key)
      line.applyOptions({ visible: !!def })
      line.setData(def ? points.map((p) => ({ time: p.date as Time, value: def.of(p) })) : [])
    }
  }, [points, view])

  useEffect(() => {
    const chart = chartRef.current
    const last = points.at(-1)
    if (!chart || !last) return
    const months = RANGES.find((r) => r.label === range)?.months
    if (months == null || points[0].date > monthsBefore(last.date, months)) chart.timeScale().fitContent()
    else chart.timeScale().setVisibleRange({ from: monthsBefore(last.date, months) as Time, to: last.date as Time })
  }, [points, range, view])

  const shown = hovered ?? points.at(-1)
  const monthEnds = points.filter(
    (p, i) => i === points.length - 1 || points[i + 1].date.slice(0, 7) !== p.date.slice(0, 7),
  )

  return (
    <div className="space-y-3">
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
              <dd className="text-sm font-semibold tabular-nums">{shown ? formatThb(s.of(shown)) : '—'}</dd>
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
          <div className="flex gap-1" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <Button
                key={r.label}
                size="xs"
                variant={range === r.label ? 'secondary' : 'ghost'}
                aria-pressed={range === r.label}
                onClick={() => setRange(r.label)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{shown ? formatDate(shown.date) : ''}</p>
      <div ref={containerRef} className="h-72 w-full" />
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer text-xs">Show as table (month-end values)</summary>
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
                      {formatThb(s.of(p))}
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
