import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'

import { PdfInspector } from '@/components/PdfInspector'
import { TransactionsTable } from '@/components/TransactionsTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { clearLocalData, db } from '@/lib/db'
import { clientId, disconnect, getAccessToken, hasValidToken, loadGoogleIdentity } from '@/lib/google/auth'
import { syncFromGmail, type SyncProgress } from '@/lib/sync'

export default function App() {
  // The birthdate lives only in this component's memory: never stored, never
  // sent anywhere. Reloading the page forgets it.
  const [pdfPassword, setPdfPassword] = useState('')
  const [connected, setConnected] = useState(hasValidToken())
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const unparsedCount = transactions?.filter((tx) => tx.parseStatus === 'unparsed').length ?? 0

  useEffect(() => {
    if (clientId) loadGoogleIdentity().catch((e: Error) => setError(e.message))
  }, [])

  const passwordValid = /^\d{8}$/.test(pdfPassword)

  async function sync() {
    setSyncing(true)
    setError(null)
    setProgress(null)
    try {
      const accessToken = await getAccessToken()
      setConnected(true)
      await syncFromGmail(accessToken, pdfPassword, setProgress)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    await disconnect()
    setConnected(false)
  }

  async function handleClear() {
    if (!confirm('Delete all transactions stored in this browser? You can re-sync them from Gmail any time.')) return
    await clearLocalData()
    setProgress(null)
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Dime! Portfolio Tracker</h1>
        <p className="text-muted-foreground max-w-2xl">
          Reads your Dime! trade confirmation emails and builds your transaction history. Everything runs in this
          browser: your emails, birthdate and trades are never sent to any server except Google's.
        </p>
      </header>

      {!clientId && (
        <Alert variant="destructive">
          <AlertTitle>Google sign-in isn't configured</AlertTitle>
          <AlertDescription>
            <p>
              Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env.local</code> and restart the dev server. See the
              README.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sync from Gmail</CardTitle>
          <CardDescription>
            Dime! locks its PDFs with your birthdate. It's used here to open them and is forgotten when you close the
            tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void sync()
            }}
          >
            <label className="flex-1 space-y-1.5">
              <span className="text-sm font-medium">Birthdate (DDMMYYYY)</span>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                placeholder="e.g. 05031995"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <Button type="submit" disabled={!clientId || !passwordValid || syncing}>
              {syncing ? 'Syncing…' : connected ? 'Sync new emails' : 'Connect Gmail & sync'}
            </Button>
          </form>

          {!connected && (
            <details className="text-muted-foreground text-sm">
              <summary className="cursor-pointer">Google says "Google hasn't verified this app"?</summary>
              <div className="mt-2 space-y-2">
                <p>
                  That's expected: this app hasn't finished Google's review yet. To continue, click{' '}
                  <strong>Advanced</strong>, then <strong>Go to … (unsafe)</strong>, and allow reading your Gmail.
                </p>
                <p>
                  The access is read-only and stays in this browser: emails are fetched straight from Google into this
                  page, and the site's security settings stop the page from sending them anywhere else. You can check
                  the{' '}
                  <a
                    className="underline underline-offset-2"
                    href="https://github.com/dreamnattapat/dime-portfolio-tracker"
                    target="_blank"
                    rel="noreferrer"
                  >
                    source code
                  </a>
                  , and remove access any time from your{' '}
                  <a
                    className="underline underline-offset-2"
                    href="https://myaccount.google.com/connections"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google account
                  </a>
                  .
                </p>
              </div>
            </details>
          )}

          {connected && (
            <p className="text-muted-foreground text-sm">
              Connected to Gmail (read-only).{' '}
              <button className="underline underline-offset-2" onClick={handleDisconnect}>
                Disconnect
              </button>
            </p>
          )}

          {progress && (
            <div className="space-y-1.5">
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 100} />
              <p className="text-muted-foreground text-sm">
                {progress.total === 0
                  ? 'No new Dime! emails.'
                  : `${progress.done} of ${progress.total} new emails read · ${progress.added} added` +
                    (progress.failed ? ` · ${progress.failed} failed (will retry next sync)` : '')}
              </p>
              {progress.firstError && (
                <p className="text-destructive text-sm">First error: {progress.firstError}</p>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Sync stopped</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {transactions === undefined
              ? 'Loading…'
              : `${transactions.length - unparsedCount} transactions` +
                (unparsedCount ? ` · ${unparsedCount} PDF(s) couldn't be read` : '')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions?.length ? (
            <TransactionsTable transactions={transactions} />
          ) : (
            transactions && (
              <p className="text-muted-foreground text-sm">Nothing yet. Sync to pull in your Dime! trades.</p>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
          <CardDescription>See exactly what the newest PDF contains, or start over.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PdfInspector pdfPassword={pdfPassword} />
          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleClear}>
            Delete local data
          </Button>
        </CardContent>
      </Card>

      <footer className="text-muted-foreground space-y-1 text-xs">
        <p>
          <a className="underline underline-offset-2" href="/privacy">
            Privacy policy
          </a>
          {' · '}
          <a
            className="underline underline-offset-2"
            href="https://github.com/dreamnattapat/dime-portfolio-tracker"
            target="_blank"
            rel="noreferrer"
          >
            Source code
          </a>
        </p>
        <p>Not affiliated with Dime! or KKP Dime Securities Company Limited.</p>
      </footer>
    </main>
  )
}
