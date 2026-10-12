import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react'
import { Fragment, useState } from 'react'

import { Pagination } from '@/components/Pagination'
import { TradeBadge } from '@/components/TradeBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePagination } from '@/hooks/usePagination'
import type { LedgerEntry } from '@/lib/analytics'
import { sumAssets, type AssetPnl } from '@/lib/assets'
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
  formatUnits,
  type Currency,
} from '@/lib/format'

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
  // Tap a row to see its trades and what each sale realized.
  const [open, setOpen] = useState<string | null>(null)

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
            <TableHead>
              <span className="sr-only">รายการซื้อขาย</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <Fragment key={r.security}>
              <TableRow
                className="cursor-pointer"
                onClick={() => setOpen(open === r.security ? null : r.security)}
                aria-expanded={open === r.security}
              >
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
                <TableCell className="w-8">
                  <ChevronDown
                    className={`text-muted-foreground size-4 transition-transform ${open === r.security ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </TableCell>
              </TableRow>
              {open === r.security && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="bg-muted/50 whitespace-normal">
                    <AssetHistory asset={r} currency={currency} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
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
            <TableCell />
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

/** One asset's trades, oldest first, with what each sale realized: the breakdown of its รับรู้แล้ว. */
function AssetHistory({ asset, currency }: { asset: AssetPnl; currency: Currency }) {
  const usd = currency === '$'
  const amount = (e: LedgerEntry) => (usd ? e.amountUsd : e.amountThb)
  const pnl = (e: LedgerEntry) => (usd ? e.pnlUsd : e.pnlThb)
  const sells = asset.history.filter((e) => e.pnlUsd != null)
  // Each sale's P&L rounded as shown (whole baht or cents) so they add up to the total on screen:
  // each shows the change in the rounded running total.
  const scale = usd ? 100 : 1
  const shown = new Map<string, number>()
  let running = 0
  let shownSoFar = 0
  for (const e of sells) {
    running += pnl(e)!
    const rounded = Math.round(running * scale) / scale
    shown.set(e.id, Math.round((rounded - shownSoFar) * scale) / scale)
    shownSoFar = rounded
  }
  return (
    // On a phone the assets table scrolls sideways: keep this in view, as a list instead of a wide table.
    <div className="sticky left-2 max-w-[calc(100vw-6rem)] space-y-2 py-1 sm:static sm:max-w-none">
      <p className="text-sm font-medium">
        {asset.security}: {asset.history.filter((e) => e.kind !== 'Split').length} รายการ
        {sells.length > 0 && ` · ขาย ${sells.length} ครั้ง`}
      </p>
      <ul className="divide-y text-xs sm:hidden">
        {asset.history.map((e) => {
          const realized = shown.get(e.id) ?? null
          const cost = e.pnlUsd != null ? e.amountUsd - e.pnlUsd : 0
          return (
            <li key={e.id} className="space-y-1 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <TradeBadge kind={e.kind} />
                  {formatDate(e.date)}
                </span>
                {realized != null && (
                  <span className={`text-right font-semibold tabular-nums ${pnlTone(realized)}`}>
                    {formatSignedMoney(realized, currency)}
                    {!e.basisComplete && '*'}
                    {cost > 0 && (
                      <span className="ml-1 font-normal opacity-80">
                        ({formatPercent((e.pnlUsd! / cost) * 100, { signed: true, decimals: 2 })})
                      </span>
                    )}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground tabular-nums">
                {e.kind === 'Split'
                  ? `${e.ratio}:1`
                  : `${formatUnits(e.units)} หน่วย × $${formatNumber(e.unitPrice)} · ${e.kind === 'Sell' ? 'รับสุทธิ' : 'จ่าย'} ${formatMoney(amount(e), currency)}`}
                {' · '}ถือ {formatUnits(e.unitsHeld)}
                {e.avgCostUsd != null && ` · ต้นทุนเฉลี่ย $${formatNumber(e.avgCostUsd, 4)}`}
              </p>
            </li>
          )
        })}
        {sells.length > 0 && (
          <li className="flex justify-between gap-2 py-2 font-medium">
            รวมรับรู้แล้ว
            <span className={`tabular-nums ${pnlTone(shownSoFar)}`}>{formatSignedMoney(shownSoFar, currency)}</span>
          </li>
        )}
      </ul>
      <Table className="hidden text-xs sm:table">
        <TableHeader>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>รายการ</TableHead>
            <TableHead className="text-right">จำนวนหน่วย</TableHead>
            <TableHead className="text-right">ราคา (USD)</TableHead>
            <TableHead className="text-right">{usd ? 'ยอดเงิน (USD)' : 'ยอดเงิน (THB)'}</TableHead>
            <TableHead className="text-right">ถือหลังรายการ</TableHead>
            <TableHead className="text-right">ต้นทุนเฉลี่ย (USD)</TableHead>
            <TableHead className="text-right">กำไร/ขาดทุนที่รับรู้</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {asset.history.map((e) => {
            const realized = shown.get(e.id) ?? null
            // The sale's cost: what was received less what it made.
            const cost = e.pnlUsd != null ? e.amountUsd - e.pnlUsd : 0
            return (
              <TableRow key={e.id} className="hover:bg-transparent">
                <TableCell>{formatDate(e.date)}</TableCell>
                <TableCell>
                  <TradeBadge kind={e.kind} />
                  {e.kind === 'Split' && <span className="text-muted-foreground ml-1">{e.ratio}:1</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.kind === 'Split' ? '—' : formatUnits(e.units)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.kind === 'Split' ? '—' : formatNumber(e.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.kind === 'Split' ? '—' : formatMoney(amount(e), currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatUnits(e.unitsHeld)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(e.avgCostUsd, 4)}</TableCell>
                {realized == null ? (
                  <TableCell className="text-muted-foreground text-right">—</TableCell>
                ) : (
                  <TableCell className={`text-right tabular-nums ${pnlTone(realized)}`}>
                    {formatSignedMoney(realized, currency)}
                    {!e.basisComplete && <span title="ขายมากกว่าที่ซื้อในอีเมล">*</span>}
                    {cost > 0 && (
                      <div className="opacity-80">
                        {formatPercent((e.pnlUsd! / cost) * 100, { signed: true, decimals: 2 })}
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
        {sells.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={7}>รวมรับรู้แล้ว</TableCell>
              <PnlCell value={shownSoFar} empty="—" currency={currency} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {sells.length > 0
          ? 'กำไรของแต่ละการขาย = ยอดรับสุทธิ (หักค่าธรรมเนียมทั้งหมด) − ต้นทุนเฉลี่ย × จำนวนที่ขาย ต้นทุนเฉลี่ยไม่รวมค่าธรรมเนียมตอนซื้อ และไม่เปลี่ยนเมื่อขาย'
          : 'ยังไม่มีการขาย กำไร/ขาดทุนทั้งหมดจึงยังไม่รับรู้'}
        {sells.some((e) => !e.basisComplete) &&
          ' * ขายมากกว่าที่ซื้อในอีเมล จึงนับส่วนที่ไม่พบรายการซื้อเป็นกำไรทั้งหมด'}
        {!usd && sells.length > 0 && ' เป็นเงินบาทที่เรทในใบยืนยันการขาย'}
      </p>
    </div>
  )
}

function pnlTone(value: number): string {
  return value > 0 ? 'text-delta-up' : value < 0 ? 'text-delta-down' : ''
}
