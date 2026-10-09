import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'

import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePagination } from '@/hooks/usePagination'
import { sumAssets, type AssetPnl } from '@/lib/assets'
import { formatNumber, formatPercent, formatSignedThb, formatThb, formatUnits } from '@/lib/format'

const COLUMNS = [
  { key: 'security', label: 'Asset', numeric: false },
  { key: 'valueThb', label: 'Value', numeric: true },
  { key: 'unrealizedThb', label: 'Unrealized', numeric: true },
  { key: 'realizedThb', label: 'Realized', numeric: true },
  { key: 'totalThb', label: 'Total P&L', numeric: true },
] as const

type SortKey = (typeof COLUMNS)[number]['key']

/** Each security's profit and loss: unrealized on what's still held, realized on what was sold. */
export function AssetsTable({ assets: all, loading }: { assets: AssetPnl[]; loading: boolean }) {
  const [filter, setFilter] = useState<'all' | 'held'>('all')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'valueThb', desc: true })

  const filtered = filter === 'held' ? all.filter((r) => r.held) : all
  const sorted = filtered.toSorted((a, b) => {
    const order = compare(a[sort.key], b[sort.key]) || compare(a.totalThb, b.totalThb)
    return sort.desc ? -order : order
  })
  const { rows, pager } = usePagination(sorted)
  const pending = loading ? '…' : '—'

  const sum = (pick: (r: AssetPnl) => number | null) => sumAssets(filtered, pick)

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'security' }))
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1" role="group" aria-label="Show">
        {(['all', 'held'] as const).map((f) => (
          <Button
            key={f}
            size="xs"
            variant={filter === f ? 'secondary' : 'ghost'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `All (${all.length})` : `Held now (${all.filter((r) => r.held).length})`}
          </Button>
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.slice(0, 1).map((c) => (
              <SortableHead key={c.key} column={c} sort={sort} onSort={toggleSort} />
            ))}
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Avg cost (USD)</TableHead>
            <TableHead className="text-right">Price (USD)</TableHead>
            {COLUMNS.slice(1).map((c) => (
              <SortableHead key={c.key} column={c} sort={sort} onSort={toggleSort} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.security}>
              <TableCell className="font-medium">
                {r.security}{' '}
                {!r.held && (
                  <Badge variant="outline" className="text-muted-foreground ml-1">
                    Sold
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {!r.held ? '—' : r.units == null ? pending : formatUnits(r.units)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.avgCostUsd, 4)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {!r.held ? '—' : r.priceUsd == null ? pending : formatNumber(r.priceUsd)}
                {r.approximated && <span title="No market price; last trade price">*</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {!r.held ? '—' : r.valueThb == null ? pending : formatThb(r.valueThb)}
              </TableCell>
              <PnlCell value={r.held ? r.unrealizedThb : null} pct={r.unrealizedPct} empty={r.held ? pending : '—'} />
              <PnlCell value={r.realizedThb || null} empty="—" />
              <PnlCell value={r.totalThb} pct={r.totalPct} empty={pending} strong />
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>Total{filter === 'held' ? ' (held now)' : ''}</TableCell>
            <TableCell className="text-right tabular-nums">
              {sum((r) => r.valueThb) == null ? pending : formatThb(sum((r) => r.valueThb))}
            </TableCell>
            <PnlCell value={sum((r) => r.unrealizedThb)} empty={pending} />
            <PnlCell value={sum((r) => r.realizedThb)} empty="—" />
            <PnlCell value={sum((r) => r.totalThb)} empty={pending} strong />
          </TableRow>
        </TableFooter>
      </Table>
      <Pagination {...pager} label="Asset pages" previous="Previous" next="Next" />
    </div>
  )
}

function compare(a: string | number | null, b: string | number | null): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1
  return typeof a === 'string' ? a.localeCompare(String(b)) : a - Number(b)
}

function SortableHead({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number]
  sort: { key: SortKey; desc: boolean }
  onSort: (key: SortKey) => void
}) {
  const active = sort.key === column.key
  const Arrow = sort.desc ? ArrowDown : ArrowUp
  return (
    <TableHead
      className={column.numeric ? 'text-right' : undefined}
      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        className={`inline-flex items-center gap-1 hover:underline ${active ? 'text-foreground' : ''}`}
        onClick={() => onSort(column.key)}
      >
        {column.label}
        {active && <Arrow className="size-3.5" aria-hidden />}
      </button>
    </TableHead>
  )
}

/** A signed THB amount (and optional %), colored by direction; the sign carries it too. */
function PnlCell({
  value,
  pct,
  empty,
  strong = false,
}: {
  value: number | null
  pct?: number | null
  empty: string
  strong?: boolean
}) {
  if (value == null) return <TableCell className="text-muted-foreground text-right">{empty}</TableCell>
  const color = value > 0 ? 'text-delta-up' : value < 0 ? 'text-delta-down' : ''
  return (
    <TableCell className={`text-right tabular-nums ${color} ${strong ? 'font-semibold' : ''}`}>
      {formatSignedThb(value)}
      {pct != null && <div className="text-xs opacity-80">{formatPercent(pct, { signed: true, decimals: 2 })}</div>}
    </TableCell>
  )
}
