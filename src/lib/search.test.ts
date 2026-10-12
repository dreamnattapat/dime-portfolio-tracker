import { describe, expect, it } from 'vitest'

import { matchesSearch, parseSearch } from './search'

const row = (security: string, transactionType: 'Buy' | 'Sell' = 'Buy', orderId = '700123') => ({
  security,
  transactionType,
  orderId,
})

describe('search', () => {
  it('finds tickers by any part, ignoring case', () => {
    expect(matchesSearch(parseSearch('avgo'), row('AVGO'))).toBe(true)
    expect(matchesSearch(parseSearch('av'), row('AVGO'))).toBe(true)
    expect(matchesSearch(parseSearch('brk.b'), row('BRK.B'))).toBe(true)
    expect(matchesSearch(parseSearch('nvda'), row('AVGO'))).toBe(false)
  })

  it('finds any of several tickers', () => {
    const q = parseSearch('AVGO, nvda')
    expect(matchesSearch(q, row('AVGO'))).toBe(true)
    expect(matchesSearch(q, row('NVDA'))).toBe(true)
    expect(matchesSearch(q, row('TSLA'))).toBe(false)
  })

  it('narrows by trade type in Thai or English', () => {
    expect(matchesSearch(parseSearch('ขาย'), row('AVGO', 'Sell'))).toBe(true)
    expect(matchesSearch(parseSearch('ขาย'), row('AVGO', 'Buy'))).toBe(false)
    expect(matchesSearch(parseSearch('avgo sell'), row('AVGO', 'Sell'))).toBe(true)
    expect(matchesSearch(parseSearch('avgo sell'), row('NVDA', 'Sell'))).toBe(false)
  })

  it('finds an order number by its start', () => {
    expect(matchesSearch(parseSearch('7001'), row('AVGO'))).toBe(true)
    expect(matchesSearch(parseSearch('7009'), row('AVGO'))).toBe(false)
  })

  it('shows everything for an empty search', () => {
    expect(matchesSearch(parseSearch('  '), row('AVGO'))).toBe(true)
  })
})
