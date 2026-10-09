import { describe, expect, it } from 'vitest'

import type { Analytics } from './analytics'
import { computeAssetPnl, sumAssets } from './assets'
import type { Timeline } from './benchmark'

const analytics = {
  assets: [
    { security: 'SGOV', boughtThb: 230_000, realizedPnlThb: -687 },
    { security: 'GOOG', boughtThb: 20_000, realizedPnlThb: 16_331 },
  ],
  openPositions: [
    { security: 'SGOV', units: 66.8120464, costBasisThb: 221_000, avgCostBasisUsd: 66.8120464 * 100.6386 },
  ],
} as Analytics

const timeline = {
  holdings: [{ security: 'SGOV', units: 66.8120464, priceUsd: 100.52, valueThb: 0, approximated: false }],
  usdThb: 34.955,
} as unknown as Timeline

describe('computeAssetPnl', () => {
  it('matches what the Dime! app shows for a holding', () => {
    // Dime!: 66.8120464 units, avg cost 100.6386, price 100.52 -> -0.12% (-276.98 THB)
    const [sgov] = computeAssetPnl(analytics, timeline)
    expect(sgov.avgCostUsd).toBeCloseTo(100.6386, 4)
    expect(sgov.unrealizedPct).toBeCloseTo(-0.118, 3)
    expect(sgov.unrealizedThb).toBeCloseTo(-276.98, 0)
    expect(sgov.totalThb).toBeCloseTo(-687 - 276.98, 0)
  })

  it('shows sold-out assets with realized P&L only', () => {
    const goog = computeAssetPnl(analytics, timeline)[1]
    expect(goog).toMatchObject({ held: false, unrealizedThb: 0, totalThb: 16_331, totalPct: expect.closeTo(81.655) })
  })

  it('leaves held assets unknown until prices load', () => {
    const rows = computeAssetPnl(analytics, null)
    expect(rows[0].unrealizedThb).toBeNull()
    expect(sumAssets(rows, (r) => r.unrealizedThb)).toBeNull()
    expect(sumAssets(rows, (r) => r.realizedThb)).toBeCloseTo(15_644)
  })
})
