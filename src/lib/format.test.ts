import { afterEach, describe, expect, it } from 'vitest'

import { formatAmount, formatPercent, formatSignedThb, formatThb, formatUnits, MASK, setHideAmounts } from '@/lib/format'

describe('hiding amounts', () => {
  afterEach(() => setHideAmounts(false))

  it('masks money and share counts but keeps percentages', () => {
    setHideAmounts(true)
    expect(formatThb(395838)).toBe(MASK)
    expect(formatSignedThb(-1235)).toBe(MASK)
    expect(formatAmount(4206.75)).toBe(MASK)
    expect(formatUnits(66.9120462)).toBe(MASK)
    expect(formatPercent(-0.3, { signed: true })).toBe('-0.3%')
  })

  it('shows everything when off, and keeps a dash for missing values', () => {
    expect(formatThb(395838)).toBe('฿395,838')
    setHideAmounts(true)
    expect(formatThb(null)).toBe('—')
  })
})
