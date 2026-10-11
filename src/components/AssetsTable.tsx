import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'

import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePagination } from '@/hooks/usePagination'
import { sumAssets, type AssetPnl } from '@/lib/assets'
import { formatMoney, formatNumber, formatPercent, formatSignedMoney, formatUnits, type Currency } from '@/lib/format'

const COLUMNS = [
  { key: 'security', label: 'สินทรัพย์', numeric: false },
  { key: 'value', label: 'มูลค่า', numeric: true },
  { key: 'unrealized', label: 'ยังไม่รับรู้', numeric: true },
  { key: 'realized', label: 'รับรู้แล้ว', numeric: true },
  { key: 'total', label: 'กำไร/ขาดทุนรวม', numeric: true },
] as const

type SortKey = (typeof COLUMNS)[number]['key']

/** Each security's profit and loss: unrealized on what's still held, realized on what was sold. */
export function AssetsTable({
  assets: all,
  loading,
  currency,
}: {
  assets: AssetPnl[]
  loading: boolean
  currency: Currency
}) {
  const [filter, setFilter] = useState<'all' | 'held'>('all')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'value', desc: true })

  const filtered = filter === 'held' ? all.filter((r) => r.held) : all
  const sorted = filtered.toSorted((a, b) => {
    const order = compare(a[sort.key], b[sort.key]) || compare(a.total, b.total)
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
      <div className="flex gap-1" role="group" aria-label="แสดง">
        {(['all', 'held'] as const).map((f) => (
          <Button
            key={f}
            size="xs"
            variant={filter === f ? 'secondary' : 'ghost'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `ทั้งหมด (${all.length})` : `ที่ถืออยู่ (${all.filter((r) => r.held).length})`}
          </Button>
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.slice(0, 1).map((c) => (
              <SortableHead key={c.key} column={c} sort={sort} onSort={toggleSort} />
            ))}
            <TableHead className="text-right">จำนวนหน่วย</TableHead>
            <TableHead className="text-right">ต้นทุนเฉลี่ย (USD)</TableHead>
            <TableHead className="text-right">ราคา (USD)</TableHead>
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
                    ขายแล้ว
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {!r.held ? '—' : r.units == null ? pending : formatUnits(r.units)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.avgCostUsd, 4)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {!r.held ? '—' : r.priceUsd == null ? pending : formatNumber(r.priceUsd)}
                {r.approximated && <span title="ไม่มีราคาตลาด ใช้ราคาซื้อขายล่าสุดแทน">*</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {!r.held ? '—' : r.value == null ? pending : formatMoney(r.value, currency)}
              </TableCell>
              <PnlCell
                value={r.held ? r.unrealized : null}
                pct={r.unrealizedPct}
                empty={r.held ? pending : '—'}
                currency={currency}
              />
              <PnlCell value={r.realized || null} empty="—" currency={currency} />
              <PnlCell value={r.total} pct={r.totalPct} empty={pending} strong currency={currency} />
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>รวม{filter === 'held' ? ' (ที่ถืออยู่)' : ''}</TableCell>
            <TableCell className="text-right tabular-nums">
              {sum((r) => r.value) == null
                ? pending
                : formatMoney(
                    sum((r) => r.value),
                    currency,
                  )}
            </TableCell>
            <PnlCell value={sum((r) => r.unrealized)} empty={pending} currency={currency} />
            <PnlCell value={sum((r) => r.realized)} empty="—" currency={currency} />
            <PnlCell value={sum((r) => r.total)} empty={pending} strong currency={currency} />
          </TableRow>
        </TableFooter>
      </Table>
      <Pagination {...pager} label="หน้าสินทรัพย์" previous="ก่อนหน้า" next="ถัดไป" />
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
  currency,
}: {
  value: number | null
  pct?: number | null
  empty: string
  strong?: boolean
  currency: Currency
}) {
  if (value == null) return <TableCell className="text-muted-foreground text-right">{empty}</TableCell>
  const color = value > 0 ? 'text-delta-up' : value < 0 ? 'text-delta-down' : ''
  return (
    <TableCell className={`text-right tabular-nums ${color} ${strong ? 'font-semibold' : ''}`}>
      {formatSignedMoney(value, currency)}
      {pct != null && <div className="text-xs opacity-80">{formatPercent(pct, { signed: true, decimals: 2 })}</div>}
    </TableCell>
  )
}
