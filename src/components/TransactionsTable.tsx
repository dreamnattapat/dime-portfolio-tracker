import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePagination } from '@/hooks/usePagination'
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

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  const { rows, pager } = usePagination([...transactions].sort(compareNewestFirst))

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
                  <span className="text-muted-foreground text-xs">Retried on next sync.</span>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
      <Pagination {...pager} label="Transactions pages" previous="Newer" next="Older" />
    </div>
  )
}
