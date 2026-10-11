import { describe, expect, it } from 'vitest'

import { netAmounts, otherSellFees } from './fees'

const sell = { transactionType: 'Sell' as const, secFeePct: 0.00206, tafPerShareUsd: 0.000195 }

describe('otherSellFees', () => {
  it('matches the Dime! app for a GOOG sell', () => {
    // 2.9622522 shares, 1,124.91 USD: SEC 0.0232 -> 0.03, TAF 0.0006 -> 0.01 minimum.
    expect(otherSellFees({ ...sell, units: 2.9622522, grossAmount: 1124.91 })).toEqual({
      secUsd: 0.03,
      tafUsd: 0.01,
      totalUsd: 0.04,
    })
  })

  it('matches the Dime! app for a DGXX sell', () => {
    expect(otherSellFees({ ...sell, units: 10, grossAmount: 78.4 }).totalUsd).toBe(0.02)
  })

  it('caps TAF and charges nothing on buys', () => {
    expect(otherSellFees({ ...sell, units: 100000, grossAmount: 10 }).tafUsd).toBe(9.79)
    expect(otherSellFees({ ...sell, transactionType: 'Buy', units: 10, grossAmount: 78.4 }).totalUsd).toBe(0)
  })

  it('falls back to the current rates when the email had none', () => {
    expect(otherSellFees({ transactionType: 'Sell', units: 2.9622522, grossAmount: 1124.91 }).totalUsd).toBe(0.04)
  })
})

describe('netAmounts', () => {
  it("gives the app's ยอดที่จะได้รับคืน", () => {
    const net = netAmounts({
      ...sell,
      units: 2.9622522,
      grossAmount: 1124.91,
      totalAmount: 1123.1,
      totalAmountThb: 36150.81,
      fxRateThbUsd: 32.1885,
    })
    expect(net.usd).toBe(1123.06)
    expect(net.thb).toBeCloseTo(36150.81 - 0.04 * 32.1885, 6)
  })
})
