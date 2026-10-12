/**
 * Excel export: every trade, and P&L per asset in both baht and USD. Built in
 * the browser and downloaded straight to the device, so nothing leaves it.
 * The writer is loaded only when the user exports, keeping the page light; its
 * "universal" build avoids Web Workers, which the site's CSP would block.
 */
import { compareOldestFirst, computeAnalytics } from '@/lib/analytics'
import { computeAssetPnl } from '@/lib/assets'
import type { Timeline } from '@/lib/benchmark'
import type { Transaction } from '@/lib/db'
import { netAmounts, otherSellFees } from '@/lib/dime/fees'
import type { ParsedTransaction } from '@/lib/dime/parser'

type Cell = { value: string | number | Date | null; type?: unknown; format?: string; fontWeight?: 'bold' } | null

const TYPE_LABELS: Record<string, string> = {
  Buy: 'ซื้อ',
  Sell: 'ขาย',
  Reward: 'รางวัล',
  'Exercise Call': 'ใช้สิทธิ Call',
  'Exercise Put': 'ใช้สิทธิ Put',
}

const USD = '#,##0.00'
const THB = '#,##0.00'
const UNITS = '#,##0.0000000'
const RATE = '0.0000'
/** Like the site and the Dime! app. */
const AVG_COST = '#,##0.0000'
const DATE = 'dd/mm/yyyy'

const header = (label: string): Cell => ({ value: label, fontWeight: 'bold' })
const text = (value: string | null | undefined): Cell => (value ? { value } : null)
const num = (value: number | null | undefined, format: string): Cell =>
  value == null || !Number.isFinite(value) ? null : { value, type: Number, format }
/** "2026-10-07" as a date cell (UTC midnight, so it lands on the same day in Excel everywhere). */
const date = (iso: string | null | undefined): Cell => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: DATE }
}

function transactionRows(transactions: Transaction[]): Cell[][] {
  const rows = transactions
    .filter((tx): tx is Transaction & ParsedTransaction => tx.parseStatus === 'ok')
    .sort(compareOldestFirst)
  return [
    [
      header('วันที่'),
      header('วันชำระราคา'),
      header('เลขที่คำสั่ง'),
      header('ประเภท'),
      header('หลักทรัพย์'),
      header('จำนวนหน่วย'),
      header('ราคา (USD)'),
      header('มูลค่าหุ้น (USD)'),
      header('ค่าคอม + VAT (USD)'),
      header('รวมตามอีเมล (USD)'),
      header('SEC + TAF (USD)'),
      header('ยอดสุทธิ (USD)'),
      header('รวมตามอีเมล (THB)'),
      header('ยอดสุทธิ (THB)'),
      header('เรท THB/USD ในอีเมล'),
    ],
    ...rows.map((tx) => {
      const net = netAmounts(tx)
      return [
        date(tx.effectiveDate ?? tx.settlementDate),
        date(tx.settlementDate),
        text(tx.orderId),
        text(TYPE_LABELS[tx.transactionType] ?? tx.transactionType),
        text(tx.security),
        num(tx.units, UNITS),
        num(tx.unitPrice, USD),
        num(tx.grossAmount, USD),
        num(Math.abs(tx.totalAmount - tx.grossAmount), USD),
        num(tx.totalAmount, USD),
        num(otherSellFees(tx).totalUsd || null, USD),
        num(net.usd, USD),
        num(tx.totalAmountThb, THB),
        num(net.thb, THB),
        num(tx.fxRateThbUsd, RATE),
      ]
    }),
  ]
}

function assetRows(transactions: Transaction[], timeline: Timeline | null): Cell[][] {
  const analytics = computeAnalytics(transactions, timeline?.splits)
  const thb = computeAssetPnl(analytics, timeline, '฿')
  const usd = computeAssetPnl(analytics, timeline, '$')
  // Held first, then by name.
  const order = thb
    .map((row, i) => ({ row, i }))
    .sort((a, b) => Number(b.row.held) - Number(a.row.held) || a.row.security.localeCompare(b.row.security))
  return [
    [
      header('สินทรัพย์'),
      header('สถานะ'),
      header('จำนวนหน่วย'),
      header('ต้นทุนเฉลี่ย (USD)'),
      header('ราคา (USD)'),
      header('มูลค่า (USD)'),
      header('มูลค่า (THB)'),
      header('ยังไม่รับรู้ (USD)'),
      header('ยังไม่รับรู้ (THB)'),
      header('รับรู้แล้ว (USD)'),
      header('รับรู้แล้ว (THB)'),
      header('กำไร/ขาดทุนรวม (USD)'),
      header('กำไร/ขาดทุนรวม (THB)'),
    ],
    ...order.map(({ row, i }) => {
      const u = usd[i]
      return [
        text(row.security),
        text(row.held ? 'ถืออยู่' : 'ขายแล้ว'),
        num(row.held ? row.units : null, UNITS),
        num(row.held ? row.avgCostUsd : null, AVG_COST),
        num(row.held ? row.priceUsd : null, USD),
        num(row.held ? u.value : null, USD),
        num(row.held ? row.value : null, THB),
        num(row.held ? u.unrealized : null, USD),
        num(row.held ? row.unrealized : null, THB),
        num(u.realized, USD),
        num(row.realized, THB),
        num(u.total, USD),
        num(row.total, THB),
      ]
    }),
  ]
}

/** Builds the workbook and saves it as songport-dime-YYYY-MM-DD.xlsx. */
export async function exportToExcel(transactions: Transaction[], timeline: Timeline | null, today: string) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const widths = (list: number[]) => list.map((width) => ({ width }))
  const blob = await writeExcelFile([
    {
      data: transactionRows(transactions),
      sheet: 'รายการซื้อขาย',
      columns: widths([12, 12, 12, 12, 10, 14, 11, 14, 14, 15, 13, 13, 15, 14, 14]),
      stickyRowsCount: 1,
    },
    {
      data: assetRows(transactions, timeline),
      sheet: 'รายสินทรัพย์',
      columns: widths([10, 9, 14, 15, 11, 13, 13, 15, 15, 14, 14, 18, 18]),
      stickyRowsCount: 1,
    },
  ] as never).toBlob()

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `songport-dime-${today}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before freeing the file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
