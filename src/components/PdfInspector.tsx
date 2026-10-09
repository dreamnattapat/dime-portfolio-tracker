import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { parseFields } from '@/lib/dime/parser'
import { getAccessToken } from '@/lib/google/auth'
import { extractLatestPdfText } from '@/lib/sync'

/**
 * Shows the raw text extracted from the newest Dime! PDF and what the parser
 * makes of it, like the Python repo's scripts/dump_pdf_text.py. Use it to
 * adjust src/lib/dime/parser.ts if Dime! changes its layout. Nothing leaves
 * the browser.
 */
export function PdfInspector({ pdfPassword }: { pdfPassword: string }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function inspect() {
    setLoading(true)
    setError(null)
    try {
      setText(await extractLatestPdfText(await getAccessToken(), pdfPassword))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={inspect} disabled={loading || pdfPassword.length !== 8}>
        {loading ? 'Reading…' : 'Inspect latest PDF'}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {text !== null && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium">Raw text</h3>
            <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{text}</pre>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">Parsed</h3>
            <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-xs">
              {JSON.stringify(parseFields(text), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
