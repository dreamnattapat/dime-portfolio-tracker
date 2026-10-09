import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Transaction } from '@/lib/db'
import { formatDate, formatNumber, formatUnits } from '@/lib/format'

function tradeDate(tx: Transaction): string {
  if (tx.parseStatus === 'ok') return tx.effectiveDate ?? tx.settlementDate
  return tx.receivedAt
}

/** Newest first; same-day trades by Dime!'s sequential order ID. */
function compareNewestFirst(a: Transaction, b: Transaction): number {
  const byDate = tradeDate(b).localeCompare(tradeDate(a))
  if (byDate !== 0) return byDate
  const orderA = a.parseStatus === 'ok' ? Number(a.orderId) : 0
  const orderB = b.parseStatus === 'ok' ? Number(b.orderId) : 0
  return orderB - orderA
}

const PAGE_SIZE = 20

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  const [page, setPage] = useState(0)
  const sorted = [...transactions].sort(compareNewestFirst)
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  // Stay on a real page if a re-sync or delete shrinks the list.
  const current = Math.min(page, pageCount - 1)
  const first = current * PAGE_SIZE
  const rows = sorted.slice(first, first + PAGE_SIZE)

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Security</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Total (USD)</TableHead>
            <TableHead className="text-right">Total (THB)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((tx) =>
            tx.parseStatus === 'ok' ? (
              <TableRow key={tx.id}>
                <TableCell>{formatDate(tradeDate(tx))}</TableCell>
                <TableCell>
                  <Badge variant={tx.transactionType === 'Sell' ? 'secondary' : 'outline'}>{tx.transactionType}</Badge>
                </TableCell>
                <TableCell className="font-medium">{tx.security}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUnits(tx.units)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(tx.unitPrice)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(tx.totalAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(tx.totalAmountThb)}</TableCell>
              </TableRow>
            ) : (
              <TableRow key={tx.id}>
                <TableCell>{formatDate(tx.receivedAt)}</TableCell>
                <TableCell colSpan={6}>
                  <Badge variant="destructive">Couldn't read</Badge>{' '}
                  <span className="text-muted-foreground text-xs">
                    This PDF's layout didn't match, so it's left out of the dashboard. It's retried on every sync.
                  </span>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Transactions pages">
          <p className="text-muted-foreground tabular-nums">
            {first + 1}–{first + rows.length} of {sorted.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeft />
              <span className="sr-only">Newer</span>
            </Button>
            <span className="text-muted-foreground tabular-nums">
              Page {current + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={current === pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight />
              <span className="sr-only">Older</span>
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
