import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePagination } from '@/hooks/usePagination'
import type { Transaction } from '@/lib/db'
import type { TransactionType } from '@/lib/dime/parser'
import { formatAmount, formatDate, formatNumber, formatUnits } from '@/lib/format'

const TYPE_LABELS: Record<TransactionType, string> = {
  Buy: 'ซื้อ',
  Sell: 'ขาย',
  Reward: 'รางวัล',
  'Exercise Call': 'ใช้สิทธิ Call',
  'Exercise Put': 'ใช้สิทธิ Put',
}

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
            <TableHead>วันที่</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>หลักทรัพย์</TableHead>
            <TableHead className="text-right">จำนวนหน่วย</TableHead>
            <TableHead className="text-right">ราคา</TableHead>
            <TableHead className="text-right">รวม (USD)</TableHead>
            <TableHead className="text-right">รวม (THB)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((tx) =>
            tx.parseStatus === 'ok' ? (
              <TableRow key={tx.id}>
                <TableCell>{formatDate(tradeDate(tx))}</TableCell>
                <TableCell>
                  <Badge variant={tx.transactionType === 'Sell' ? 'secondary' : 'outline'}>
                    {TYPE_LABELS[tx.transactionType] ?? tx.transactionType}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{tx.security}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUnits(tx.units)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(tx.unitPrice)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(tx.totalAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(tx.totalAmountThb)}</TableCell>
              </TableRow>
            ) : (
              <TableRow key={tx.id}>
                <TableCell>{formatDate(tx.receivedAt)}</TableCell>
                <TableCell colSpan={6}>
                  <Badge variant="destructive">อ่านไม่ได้</Badge>{' '}
                  <span className="text-muted-foreground text-xs">จะลองใหม่ในการซิงก์ครั้งถัดไป</span>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
      <Pagination {...pager} label="หน้ารายการซื้อขาย" previous="ใหม่กว่า" next="เก่ากว่า" />
    </div>
  )
}
