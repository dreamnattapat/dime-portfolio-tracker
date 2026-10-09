/**
 * Parses the text of Dime! (KKP Dime Securities) trade confirmation PDFs.
 *
 * Ported from dime-auto-log-transactions/src/pdf_parser.py. pdf.js (used here)
 * splits each order's table row across three lines, because the ticker and USD
 * amount cells sit slightly higher than the rest of the row:
 *
 *   SOFI 310.00 0.50 0.00 310.50
 *   700001 08/10/2026 BUY 20.0000000 15.50 USD
 *   [XNAS] 10,374.58 16.73 0.00 10,391.31
 *
 * pdfplumber (the Python version) produced one line per order instead, which
 * is still accepted:
 *
 *   671785 27/08/2026 BUY NVTS 100.0000000 12.79 USD 1,278.50 2.05 0.00 1,280.55
 *   [XNAS] 41,617.99 66.73 0.00 41,684.72
 *
 * One confirmation can hold several orders, so `parseFields` returns a list.
 * Unlike the Python version, amounts are converted to numbers and dates to ISO
 * `YYYY-MM-DD` here, so stored rows are ready to compute with.
 */

export type TransactionType = 'Buy' | 'Sell' | 'Reward' | 'Exercise Call' | 'Exercise Put'

const TRANSACTION_TYPES: Record<string, TransactionType> = {
  BUY: 'Buy',
  SEL: 'Sell',
  REW: 'Reward',
  EXC: 'Exercise Call',
  EXP: 'Exercise Put',
}

export type ParsedTransaction = {
  parseStatus: 'ok'
  orderId: string
  settlementDate: string
  transactionType: TransactionType
  security: string
  units: number
  unitPrice: number
  currency: string
  grossAmount: number
  vat: number
  withholdingTax: number
  totalAmount: number
  exchange: string | null
  grossAmountThb: number | null
  vatThb: number | null
  withholdingTaxThb: number | null
  totalAmountThb: number | null
} & DocumentHeaders

export type UnparsedDocument = {
  parseStatus: 'unparsed'
  rawTextSnippet: string
} & DocumentHeaders

export type ParseResult = ParsedTransaction | UnparsedDocument

/** One value per document, attached to every order row found in it. */
export type DocumentHeaders = {
  accountNo: string | null
  taxInvoiceNo: string | null
  totalBuyThb: number | null
  totalSellThb: number | null
  totalFeeThb: number | null
  totalVatThb: number | null
  totalWithholdingTaxThb: number | null
  fxRateThbUsd: number | null
  effectiveDate: string | null
  issueDate: string | null
}

const AMOUNT = String.raw`[\d,]+\.\d+`

// pdf.js layout, line 1 of 3: ticker + USD amounts, e.g.
// SOFI 310.00 0.50 0.00 310.50
const SECURITY_AMOUNTS_RE = new RegExp(
  String.raw`^(?<security>[A-Z][A-Z0-9.]*)\s+` +
    String.raw`(?<grossAmount>${AMOUNT})\s+` +
    String.raw`(?<vat>${AMOUNT})\s+` +
    String.raw`(?<withholdingTax>${AMOUNT})\s+` +
    String.raw`(?<totalAmount>${AMOUNT})\s*$`,
)

// pdf.js layout, line 2 of 3: the rest of the order, e.g.
// 700001 08/10/2026 BUY 20.0000000 15.50 USD
const ORDER_LINE_RE = new RegExp(
  String.raw`^(?<orderId>\d+)\s+` +
    String.raw`(?<settlementDate>\d{2}/\d{2}/\d{4})\s+` +
    String.raw`(?<transactionType>BUY|SEL|REW|EXC|EXP)\s+` +
    String.raw`(?<units>${AMOUNT})\s+` +
    String.raw`(?<unitPrice>${AMOUNT})\s+` +
    String.raw`(?<currency>[A-Z]{3})\s*$`,
)

// pdfplumber layout: the whole order on one line, e.g.
// 671785 27/08/2026 BUY NVTS 100.0000000 12.79 USD 1,278.50 2.05 0.00 1,280.55
const SINGLE_LINE_ORDER_RE = new RegExp(
  String.raw`^(?<orderId>\d+)\s+` +
    String.raw`(?<settlementDate>\d{2}/\d{2}/\d{4})\s+` +
    String.raw`(?<transactionType>BUY|SEL|REW|EXC|EXP)\s+` +
    String.raw`(?<security>[A-Z0-9.]+)\s+` +
    String.raw`(?<units>${AMOUNT})\s+` +
    String.raw`(?<unitPrice>${AMOUNT})\s+` +
    String.raw`(?<currency>[A-Z]{3})\s+` +
    String.raw`(?<grossAmount>${AMOUNT})\s+` +
    String.raw`(?<vat>${AMOUNT})\s+` +
    String.raw`(?<withholdingTax>${AMOUNT})\s+` +
    String.raw`(?<totalAmount>${AMOUNT})\s*$`,
)

// THB-equivalent row that follows an order (both layouts), e.g.
// [XNAS] 10,374.58 16.73 0.00 10,391.31
const EXCHANGE_ROW_RE = new RegExp(
  String.raw`^\[(?<exchange>[A-Za-z0-9]+)\]\s+` +
    String.raw`(?<grossAmountThb>${AMOUNT})\s+` +
    String.raw`(?<vatThb>${AMOUNT})\s+` +
    String.raw`(?<withholdingTaxThb>${AMOUNT})\s+` +
    String.raw`(?<totalAmountThb>${AMOUNT})\s*$`,
)

// Each header field lists patterns to try in order: the pdf.js layout first,
// then the pdfplumber one. In the pdf.js layout some values come out on the
// line between the Thai and English labels instead of after the label.
const ACCOUNT_AND_INVOICE_RE = /เลขที่บัญชี\s+เลขที่ใบกำกับภาษี\s*\n\s*(?<accountNo>\d+)\s+(?<taxInvoiceNo>[A-Z0-9]+)\s*$/mu

const HEADER_PATTERNS: Record<string, RegExp[]> = {
  accountNo: [/Account No\.\s*(\d+)/u],
  taxInvoiceNo: [/Tax Invoice No\.\s*([A-Z0-9]\S*)/u],
  totalBuyThb: [/รวมมูลค่าซื้อ\s*\(THB\)\s*([\d,]+\.\d+)/u],
  totalSellThb: [/รวมมูลค่าขาย\s*\(THB\)\s*([\d,]+\.\d+)/u],
  totalFeeThb: [
    /([\d,]+\.\d+)\s*\n\s*Total Fee \(Exclude VAT\)/u,
    /ค่าธรรมเนียมไม่รวมภาษีมูลค่าเพิ่ม\s*([\d,]+\.\d+)/u,
  ],
  totalVatThb: [/ภาษีมูลค่าเพิ่ม\s*\(THB\)\s*([\d,]+\.\d+)/u],
  totalWithholdingTaxThb: [/ภาษีหัก\s*ณ\s*ที่จ่าย\s*\(THB\)\s*([\d,]+\.\d+)/u],
  fxRateThbUsd: [/THB\/USD\s*=\s*([\d.]+)/u],
}

const EFFECTIVE_ISSUE_DATE_RE =
  /วันที่คำสั่งมีผล\s*วันที่ออกใบกำกับภาษี\s*\n\s*(?<effectiveDate>\d{2}\/\d{2}\/\d{4})\s+(?<issueDate>\d{2}\/\d{2}\/\d{4})/u

/** "1,278.50" -> 1278.5 */
export function toNumber(value: string): number {
  return Number(value.replaceAll(',', ''))
}

/** "27/08/2026" -> "2026-08-27" */
export function toIsoDate(value: string): string {
  const [day, month, year] = value.split('/')
  return `${year}-${month}-${day}`
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const value = pattern.exec(text)?.[1]?.trim()
    if (value) return value
  }
  return null
}

function numberOrNull(value: string | null | undefined): number | null {
  return value == null ? null : toNumber(value)
}

function parseHeaders(text: string): DocumentHeaders {
  const ids = ACCOUNT_AND_INVOICE_RE.exec(text)?.groups
  const dates = EFFECTIVE_ISSUE_DATE_RE.exec(text)?.groups
  const number = (field: string) => numberOrNull(firstMatch(text, HEADER_PATTERNS[field]))
  return {
    accountNo: ids?.accountNo ?? firstMatch(text, HEADER_PATTERNS.accountNo),
    taxInvoiceNo: ids?.taxInvoiceNo ?? firstMatch(text, HEADER_PATTERNS.taxInvoiceNo),
    totalBuyThb: number('totalBuyThb'),
    totalSellThb: number('totalSellThb'),
    totalFeeThb: number('totalFeeThb'),
    totalVatThb: number('totalVatThb'),
    totalWithholdingTaxThb: number('totalWithholdingTaxThb'),
    fxRateThbUsd: number('fxRateThbUsd'),
    effectiveDate: dates ? toIsoDate(dates.effectiveDate) : null,
    issueDate: dates ? toIsoDate(dates.issueDate) : null,
  }
}

/** The order's fields as raw strings, from either layout, or null if `i` isn't an order line. */
function matchOrder(lines: string[], i: number): Record<string, string> | 'incomplete' | null {
  const single = SINGLE_LINE_ORDER_RE.exec(lines[i])?.groups
  if (single) return single

  const order = ORDER_LINE_RE.exec(lines[i])?.groups
  if (!order) return null
  // The ticker + USD amounts line normally comes just before the order line.
  const amounts =
    SECURITY_AMOUNTS_RE.exec(lines[i - 1] ?? '')?.groups ?? SECURITY_AMOUNTS_RE.exec(lines[i + 1] ?? '')?.groups
  return amounts ? { ...order, ...amounts } : 'incomplete'
}

export function parseFields(text: string): ParseResult[] {
  const headers = parseHeaders(text)
  const lines = text.split('\n')

  const transactions: ParseResult[] = []
  let incomplete = false
  lines.forEach((_, i) => {
    const row = matchOrder(lines, i)
    if (row === 'incomplete') incomplete = true
    if (row === null || row === 'incomplete') return

    // THB-equivalent totals follow the order (one line further down if the
    // ticker line came after the order line).
    const thb = [lines[i + 1], lines[i + 2]].map((line) => EXCHANGE_ROW_RE.exec(line ?? '')?.groups).find(Boolean)

    transactions.push({
      ...headers,
      parseStatus: 'ok',
      orderId: row.orderId,
      settlementDate: toIsoDate(row.settlementDate),
      transactionType: TRANSACTION_TYPES[row.transactionType],
      security: row.security,
      units: toNumber(row.units),
      unitPrice: toNumber(row.unitPrice),
      currency: row.currency,
      grossAmount: toNumber(row.grossAmount),
      vat: toNumber(row.vat),
      withholdingTax: toNumber(row.withholdingTax),
      totalAmount: toNumber(row.totalAmount),
      exchange: thb?.exchange ?? null,
      grossAmountThb: numberOrNull(thb?.grossAmountThb),
      vatThb: numberOrNull(thb?.vatThb),
      withholdingTaxThb: numberOrNull(thb?.withholdingTaxThb),
      totalAmountThb: numberOrNull(thb?.totalAmountThb),
    })
  })

  if (transactions.length === 0 || incomplete) {
    // Nothing (or not everything) matched: keep a row so the email isn't
    // silently dropped. It's retried on the next sync, and the raw text
    // snippet helps diagnose a layout change.
    transactions.push({ ...headers, parseStatus: 'unparsed', rawTextSnippet: text.slice(0, 500) })
  }

  return transactions
}
