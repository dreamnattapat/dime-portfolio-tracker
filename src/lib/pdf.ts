/**
 * Decrypts a PDF and extracts its text, entirely in the browser (pdf.js).
 *
 * pdf.js returns positioned text runs rather than lines, so they're regrouped
 * into lines by vertical position and joined left to right. That mimics what
 * pdfplumber gave the Python version, which the parser regexes expect.
 */
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
// The legacy build bundles polyfills for the newest JS features pdf.js uses
// (e.g. Map.getOrInsertComputed). Without them every PDF fails on browsers
// that lack those features, such as iPhone Safari.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

/** Thrown when the birthdate doesn't open the PDF. */
export class WrongPasswordError extends Error {
  constructor() {
    super("The birthdate didn't open the PDF. Check it's DDMMYYYY (e.g. 05031995).")
    this.name = 'WrongPasswordError'
  }
}

// Loaded on first use so the (large) PDF engine isn't in the initial page load.
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

export async function extractText(pdfBytes: Uint8Array, password: string): Promise<string> {
  const pdfjs = await loadPdfjs()

  // pdf.js takes ownership of the buffer, so hand it a copy.
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice(), password })
  try {
    const doc = await loadingTask.promise.catch((error: unknown) => {
      throw error instanceof pdfjs.PasswordException ? new WrongPasswordError() : error
    })
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      pages.push(itemsToLines(content.items.filter((item): item is TextItem => 'str' in item)))
    }
    return pages.join('\n')
  } finally {
    await loadingTask.destroy()
  }
}

type Line = { y: number; items: TextItem[] }

// Runs whose baselines are this close (PDF units) belong to the same line.
const LINE_TOLERANCE = 2
// A horizontal gap wider than this between runs becomes a space.
const WORD_GAP = 1

export function itemsToLines(items: TextItem[]): string {
  const lines: Line[] = []
  for (const item of items) {
    if (!item.str) continue
    const y = item.transform[5]
    const line = lines.find((l) => Math.abs(l.y - y) <= LINE_TOLERANCE)
    if (line) line.items.push(item)
    else lines.push({ y, items: [item] })
  }

  // PDF y grows upwards, so the top line has the largest y.
  lines.sort((a, b) => b.y - a.y)
  return lines
    .map(({ items: lineItems }) => {
      lineItems.sort((a, b) => a.transform[4] - b.transform[4])
      let text = ''
      let prevEnd: number | null = null
      for (const item of lineItems) {
        const x = item.transform[4]
        if (prevEnd !== null && x - prevEnd > WORD_GAP && !text.endsWith(' ') && !item.str.startsWith(' ')) {
          text += ' '
        }
        text += item.str
        prevEnd = x + item.width
      }
      return text.trim()
    })
    .filter(Boolean)
    .join('\n')
}
