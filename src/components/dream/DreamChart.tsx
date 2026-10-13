import { ColorType, createChart, CrosshairMode, LineSeries, type Time } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'

import type { DreamPoint } from '@/lib/dream'
import { formatDate, formatPercent } from '@/lib/format'

const toPct = (value: number, start: number) => (value / start - 1) * 100

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Dream vs the S&P 500, % since the start. */
export function DreamChart({ points, startingCash }: { points: DreamPoint[]; startingCash: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const pct = (v: number) => toPct(v, startingCash)

  useEffect(() => {
    const chart = createChart(ref.current!, {
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
      localization: { locale: 'th-TH-u-ca-gregory', priceFormatter: (v: number) => `${v.toFixed(1)}%` },
      handleScroll: false,
      handleScale: false,
    })
    const line = (color: string) =>
      chart.addSeries(LineSeries, {
        color: cssVar(color),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
    const spy = line('--series-spy')
    const dream = line('--series-dream')
    spy.setData(points.map((p) => ({ time: p.date as Time, value: toPct(p.spy, startingCash) })))
    dream.setData(points.map((p) => ({ time: p.date as Time, value: toPct(p.value, startingCash) })))
    chart.timeScale().fitContent()
    const index = new Map(points.map((p, i) => [p.date, i]))
    chart.subscribeCrosshairMove((param) => setHovered(param.time ? (index.get(String(param.time)) ?? null) : null))
    return () => chart.remove()
  }, [points, startingCash])

  const shown = points[hovered ?? points.length - 1]
  return (
    <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {(
          [
            ['ทีม Dream', '--series-dream', shown && pct(shown.value)],
            ['S&P 500', '--series-spy', shown && pct(shown.spy)],
          ] as const
        ).map(([label, color, value]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: `var(${color})` }} aria-hidden />
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatPercent(value, { signed: true, decimals: 2 })}</dd>
          </div>
        ))}
        <p className="text-muted-foreground text-xs sm:ml-auto">{shown ? formatDate(shown.date) : ''}</p>
      </dl>
      <div ref={ref} className="h-56 w-full" />
    </div>
  )
}
