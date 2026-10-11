import { describe, expect, it } from 'vitest'

import { PriceSeries } from '@/lib/prices'

describe('PriceSeries.scaled', () => {
  it('scales every close and ends at the given latest rate', () => {
    const market = new PriceSeries('THB=X', [['2026-10-08', 33.5], ['2026-10-09', 33.48]], 33.48)
    const dime = market.scaled(33.42 / 33.48, 33.42)
    expect(dime.latest).toBe(33.42)
    expect(dime.on('2026-10-09')).toBeCloseTo(33.42, 10)
    expect(dime.on('2026-10-08')).toBeCloseTo(33.5 * (33.42 / 33.48), 10)
    // The day-to-day change is unchanged.
    expect(dime.on('2026-10-09') / dime.on('2026-10-08')).toBeCloseTo(33.48 / 33.5, 10)
  })
})
