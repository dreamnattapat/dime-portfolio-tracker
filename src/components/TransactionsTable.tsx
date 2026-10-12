import { ChevronDown, ExternalLink } from 'lucide-react'
import { Fragment, useState } from 'react'

import { Pagination } from '@/components/Pagination'
import { SearchBox } from '@/components/SearchBox'
import { TradeBadge } from '@/components/TradeBadge'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePagination } from '@/hooks/usePagination'
import type { Transaction } from '@/lib/db'
import { netAmounts, otherSellFees } from '@/lib/dime/fees'
import type { ParsedTransaction } from '@/lib/dime/parser'
import { formatAmount, formatDate, formatNumber, formatUnits } from '@/lib/format'
import { matchesSearch, parseSearch } from '@/lib/search'

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

/** Opens the confirmation email itself, in the first Gmail account signed in on this browser. */
function gmailLink(messageId: string): string {
  return `https://mail.google.com/mail/#all/${messageId}`
}

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  const [search, setSearch] = useState('')
  const query = parseSearch(search)
  const searching = query.tickers.length > 0 || query.types.length > 0
  // Emails that couldn't be read have nothing to match, so a search leaves them out.
  const matching = searching
    ? transactions.filter((tx) => tx.parseStatus === 'ok' && matchesSearch(query, tx))
    : transactions
  const { rows, pager } = usePagination([...matching].sort(compareNewestFirst))
  // Tap a row to see what the site read from its email, and a link to the email.
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox
          value={search}
          onChange={(value) => {
            setSearch(value)
            pager.setPage(0)
          }}
          placeholder="ค้นหาหุ้น, ซื้อ/ขาย หรือเลขที่คำสั่ง"
          label="ค้นหารายการซื้อขาย"
          className="w-full sm:w-72"
        />
        {searching && (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            พบ {matching.length} จาก {transactions.length} รายการ
          </p>
        )}
      </div>
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
            <TableHead>
              <span className="sr-only">รายละเอียด</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && searching && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="text-muted-foreground py-6 text-center">
                ไม่พบ “{search.trim()}”
              </TableCell>
            </TableRow>
          )}
          {rows.map((tx) =>
            tx.parseStatus === 'ok' ? (
              <Fragment key={tx.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setOpen(open === tx.id ? null : tx.id)}
                  aria-expanded={open === tx.id}
                >
                  <TableCell>{formatDate(tradeDate(tx))}</TableCell>
                  <TableCell>
                    <TradeBadge kind={tx.transactionType} />
                  </TableCell>
                  <TableCell className="font-medium">{tx.security}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUnits(tx.units)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(tx.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(netAmounts(tx).usd)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(netAmounts(tx).thb)}</TableCell>
                  <TableCell className="w-8">
                    <ChevronDown
                      className={`text-muted-foreground size-4 transition-transform ${open === tx.id ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </TableCell>
                </TableRow>
                {open === tx.id && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="bg-muted/50 whitespace-normal">
                      <TradeDetails tx={tx} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ) : (
              <TableRow key={tx.id}>
                <TableCell>{formatDate(tx.receivedAt)}</TableCell>
                <TableCell colSpan={7}>
                  <Badge variant="destructive">อ่านไม่ได้</Badge>{' '}
                  <span className="text-muted-foreground text-xs">จะลองใหม่ในการซิงก์ครั้งถัดไป</span>{' '}
                  <EmailLink messageId={tx.gmailMessageId} />
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

/** What the site read from one confirmation email, to check against the Dime! app. */
function TradeDetails({ tx }: { tx: ParsedTransaction & { gmailMessageId: string } }) {
  const fees = Math.abs(tx.totalAmount - tx.grossAmount)
  const feesThb =
    tx.totalAmountThb != null && tx.grossAmountThb != null ? Math.abs(tx.totalAmountThb - tx.grossAmountThb) : null
  // The rate the email's baht figures work out to; can differ from the rate printed on it.
  const impliedRate = tx.totalAmountThb != null && tx.totalAmount ? tx.totalAmountThb / tx.totalAmount : null
  // Sells: the SEC and TAF fees Dime! deducts after the confirmation ("ค่าธรรมเนียมรอจ่าย").
  const other = otherSellFees(tx)
  const net = netAmounts(tx)
  return (
    <div className="sticky left-0 max-w-[calc(100vw-6rem)] space-y-3 py-1 text-xs sm:max-w-xl">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 sm:grid-cols-[auto_auto_auto_1fr]">
        <Detail label="เลขที่คำสั่ง" value={tx.orderId} />
        <Detail label="วันชำระราคา" value={formatDate(tx.settlementDate)} />
        <Detail label="มูลค่าหุ้น (USD)" value={formatAmount(tx.grossAmount)} />
        <Detail label="มูลค่าหุ้น (THB)" value={formatAmount(tx.grossAmountThb)} />
        <Detail label="ค่าคอม + VAT (USD)" value={formatAmount(fees)} />
        <Detail label="ค่าคอม + VAT (THB)" value={formatAmount(feesThb)} />
        <Detail label="รวมตามอีเมล (USD)" value={formatAmount(tx.totalAmount)} />
        <Detail label="รวมตามอีเมล (THB)" value={formatAmount(tx.totalAmountThb)} />
        {other.totalUsd > 0 && (
          <>
            <Detail label="ค่าธรรมเนียม SEC (USD)" value={formatAmount(other.secUsd)} />
            <Detail label="ค่าธรรมเนียม TAF (USD)" value={formatAmount(other.tafUsd)} />
            <Detail label="ยอดรับคืนสุทธิ (USD)" value={formatAmount(net.usd)} />
            <Detail label="ยอดรับคืนสุทธิ (THB)" value={formatAmount(net.thb)} />
          </>
        )}
        <Detail label="เรท THB/USD ในอีเมล" value={formatNumber(tx.fxRateThbUsd, 4)} />
        <Detail label="เรทจากยอดเงินบาท" value={formatNumber(impliedRate, 4)} />
      </dl>
      {other.totalUsd > 0 && (
        <p className="text-muted-foreground">
          ค่าธรรมเนียม SEC และ TAF ไม่อยู่ในอีเมล เว็บนี้คำนวณจากอัตราในท้ายอีเมล ให้ตรงกับ "ยอดที่จะได้รับคืน" ในแอป
        </p>
      )}
      <p className="text-muted-foreground">
        เงินบาทในอีเมลคิดที่เรทอ้างอิง ไม่ใช่เรทที่แลกจริงใน Dime! Fast (ซึ่งมักสูงกว่าเล็กน้อย)
        ยอดเงินบาทในเว็บนี้จึงอาจต่างจากในแอปเล็กน้อย ส่วนยอด USD ตรงกับแอป
      </p>
      <EmailLink messageId={tx.gmailMessageId} />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </>
  )
}

function EmailLink({ messageId }: { messageId: string }) {
  return (
    <a
      href={gmailLink(messageId)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-brand inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
    >
      เปิดอีเมลใน Gmail
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  )
}
