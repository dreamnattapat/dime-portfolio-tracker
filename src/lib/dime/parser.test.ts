import { describe, expect, it } from 'vitest'

import { parseFields, toIsoDate, toNumber } from './parser'

// Page 1 of a real two-order confirmation as pdf.js extracts it (Oct 2026),
// with identifying numbers and amounts changed and the fee footnotes trimmed.
const PDFJS_TWO_BUYS = `ทะเบียนเลขที่ / Registration No.0105564162055
ใบยืนยันการซื้อขาย / ใบเสร็จรับเงิน / ใบกำกับภาษี
เลขประจำตัวผู้เสียภาษี / Tax ID. 0000000000000
Confirmation Note / Receipt / Tax Invoice สาขาที่ออกใบกำกับภาษี สาขาสำนักงานใหญ่ / Tax Invoice issued at head office
เลขที่สาขา 00000
ประเภทบัญชี เลขที่
Limited Margin Account 2026100800000001
Account Type No.
NAME SURNAME
Location
เลขที่บัญชี เลขที่ใบกำกับภาษี
12345678901 DIMEOS20261008000001
Account No. Tax Invoice No.
เลขประจำตัวผู้เสียภาษีอากร /TAX I.D. 9999999999999
วันที่คำสั่งมีผล วันที่ออกใบกำกับภาษี
07/10/2026 08/10/2026
Effective Date Issue Date
ค่าธรรมเนียม ภาษีหัก
ราคาต่อหน่วย สกุลเงิน จำนวนเงิน รวมภาษีมูลค่าเพิ่ม ณ ที่จ่าย จำนวนเงินรวม
ชื่อหลักทรัพย์
วันที่ครบ ประเภท Unit Price Currency Gross Amount Total Amount
เลขที่คำสั่ง [ตลาด] จำนวนหน่วย Fee Include Vat Withholding Tax
กำหนดชำระ รายการ
Order ID Securities Unit
Settlement Date Transaction Type
[Exchange]
CCY CCY CCY CCY
CCY CCY 1 1 1
1
THB THB THB THB
SOFI 310.00 0.50 0.00 310.50
700001 08/10/2026 BUY 20.0000000 15.50 USD
[XNAS] 10,374.58 16.73 0.00 10,391.31
BRK.B 1,450.00 2.33 0.00 1,452.33
700002 08/10/2026 BUY 3.0000000 483.33 USD
[XNYS] 48,526.28 77.98 0.00 48,604.26
แผ่นที่ / Page 1 /2
รวมมูลค่าซื้อ (THB)
58,995.57
Total Buy
ค่าธรรมเนียมอื่น ๆ ประกอบด้วย* รวมมูลค่าขาย (THB)
0.00
Total Sell
ค่าธรรมเนียมไม่รวมภาษีมูลค่าเพิ่ม
3. ค่าธรรมเนียมการซื้อขายตราสาร ADR ที่ผู้ออกตราสารเรียกเก็บ เรียกเก็บที่ 0.01 USD ถึง 0.03 USD ต่อหุ้น ขั้นต่ำ 0.01 USD ต่อรายการ 88.62
Total Fee (Exclude VAT)
ส่วนลด (THB)
0.00
Discount
ไม่รวมภาษีมูลค่าเพิ่ม (THB)
ลูกค้าสามารถตรวจสอบค่าธรรมเนียมได้ที่ www.dime.co.th 88.62
Total Fee After Discount
2. Trading Activity Fee (TAF) at a rate of 0.000195 USD per share sold, with a minimum of 0.01 USD and a maximum of ภาษีมูลค่าเพิ่ม (THB)
6.20
9.79 USD per trade, and at a rate of 0.00329 USD for option contract sold. Total Vat
5. Options Regulatory Fee (ORF) at a rate of 0.02295 USD per contract. ภาษีหัก ณ ที่จ่าย (THB)
0.00
Vat calculates based on Foreign Exchange Average Buying Rates Transfer of BOT as of 07 October 2026
THB/USD = 33.4664
BUY ซื้อหลักทรัพย์ (Buy)
SEL ขายหลักทรัพย์ (Sell)`

// The one-line-per-order layout pdfplumber produced for the Python version.
const PDFPLUMBER_ONE_BUY = `Account No. 12345678
Tax Invoice No. INV2026-000123
วันที่คำสั่งมีผล วันที่ออกใบกำกับภาษี
27/08/2026 28/08/2026
671785 27/08/2026 BUY NVTS 100.0000000 12.79 USD 1,278.50 2.05 0.00 1,280.55
[XNAS] 41,617.99 66.73 0.00 41,684.72
รวมมูลค่าซื้อ (THB) 41,684.72
THB/USD = 32.5517`

describe('parseFields, pdf.js layout (order split over three lines)', () => {
  const rows = parseFields(PDFJS_TWO_BUYS)

  it('finds every order and nothing else', () => {
    expect(rows.map((r) => r.parseStatus)).toEqual(['ok', 'ok'])
  })

  it('combines the ticker, order and THB lines into one transaction', () => {
    expect(rows[0]).toEqual({
      parseStatus: 'ok',
      orderId: '700001',
      settlementDate: '2026-10-08',
      transactionType: 'Buy',
      security: 'SOFI',
      units: 20,
      unitPrice: 15.5,
      currency: 'USD',
      grossAmount: 310,
      vat: 0.5,
      withholdingTax: 0,
      totalAmount: 310.5,
      exchange: 'XNAS',
      grossAmountThb: 10374.58,
      vatThb: 16.73,
      withholdingTaxThb: 0,
      totalAmountThb: 10391.31,
      accountNo: '12345678901',
      taxInvoiceNo: 'DIMEOS20261008000001',
      totalBuyThb: 58995.57,
      totalSellThb: 0,
      totalFeeThb: 88.62,
      totalVatThb: 6.2,
      totalWithholdingTaxThb: 0,
      fxRateThbUsd: 33.4664,
      effectiveDate: '2026-10-07',
      issueDate: '2026-10-08',
    })
  })

  it('handles share-class tickers and thousands separators', () => {
    expect(rows[1]).toMatchObject({
      orderId: '700002',
      security: 'BRK.B',
      units: 3,
      grossAmount: 1450,
      totalAmount: 1452.33,
      exchange: 'XNYS',
      totalAmountThb: 48604.26,
    })
  })

  it('flags the email for retry when an order line has no ticker line', () => {
    const text = PDFJS_TWO_BUYS.replace('BRK.B 1,450.00 2.33 0.00 1,452.33\n', '')

    expect(parseFields(text).map((r) => r.parseStatus)).toEqual(['ok', 'unparsed'])
  })
})

describe('parseFields, pdfplumber layout (one line per order)', () => {
  it('parses the order, its THB row and headers', () => {
    const [tx] = parseFields(PDFPLUMBER_ONE_BUY)

    expect(tx).toMatchObject({
      parseStatus: 'ok',
      orderId: '671785',
      settlementDate: '2026-08-27',
      transactionType: 'Buy',
      security: 'NVTS',
      units: 100,
      unitPrice: 12.79,
      totalAmount: 1280.55,
      exchange: 'XNAS',
      totalAmountThb: 41684.72,
      accountNo: '12345678',
      taxInvoiceNo: 'INV2026-000123',
      totalBuyThb: 41684.72,
      fxRateThbUsd: 32.5517,
      effectiveDate: '2026-08-27',
      issueDate: '2026-08-28',
    })
  })

  it('returns every order when one email batches several', () => {
    const text = `671790 01/09/2026 SEL BRK.B 0.5000000 480.10 USD 240.05 0.39 0.00 239.66
[XNYS] 7,801.63 12.68 0.00 7,788.95
671791 01/09/2026 BUY SGOV 10.0000000 100.45 USD 1,004.50 1.61 0.00 1,006.11
[ARCX] 32,646.25 52.32 0.00 32,698.57`

    const rows = parseFields(text)

    expect(rows.map((r) => r.parseStatus === 'ok' && [r.transactionType, r.security])).toEqual([
      ['Sell', 'BRK.B'],
      ['Buy', 'SGOV'],
    ])
  })
})

describe('parseFields, unrecognised layout', () => {
  it('returns one unparsed row with a text snippet', () => {
    const rows = parseFields('Some new layout Dime! started using')

    expect(rows).toEqual([
      expect.objectContaining({ parseStatus: 'unparsed', rawTextSnippet: 'Some new layout Dime! started using' }),
    ])
  })
})

describe('helpers', () => {
  it('converts amounts and dates', () => {
    expect(toNumber('41,617.99')).toBe(41617.99)
    expect(toIsoDate('27/08/2026')).toBe('2026-08-27')
  })
})
