import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { describe, expect, it } from 'vitest'

import { itemsToLines } from './pdf'

function item(str: string, x: number, y: number, width = str.length * 5): TextItem {
  return { str, dir: 'ltr', transform: [10, 0, 0, 10, x, y], width, height: 10, fontName: 'f', hasEOL: false }
}

describe('itemsToLines', () => {
  it('rebuilds lines top to bottom, runs left to right, with spaces between gaps', () => {
    const items = [
      // Second line first, out of order, to prove sorting.
      item('41,617.99', 60, 700),
      item('[XNAS]', 10, 700.5),
      item('BUY', 120, 720),
      item('671785', 10, 720),
      item('27/08/2026', 50, 720),
    ]

    expect(itemsToLines(items)).toBe('671785 27/08/2026 BUY\n[XNAS] 41,617.99')
  })

  it('joins runs that touch without adding a space', () => {
    // e.g. a word split across two runs, or a Thai combining mark.
    expect(itemsToLines([item('NV', 10, 700, 10), item('TS', 20, 700, 10)])).toBe('NVTS')
  })

  it('skips empty runs', () => {
    expect(itemsToLines([item('', 10, 700), item('A', 10, 680)])).toBe('A')
  })
})
