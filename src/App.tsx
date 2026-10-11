import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Eye, EyeOff, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Dashboard } from '@/components/Dashboard'
import { BirthdateStep, ConnectStep, DataPath, Stepper, SyncStatus } from '@/components/Onboarding'
import { Support } from '@/components/Support'
import { TransactionsTable } from '@/components/TransactionsTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { parseBirthdate } from '@/lib/birthdate'
import {
  clearLocalData,
  db,
  getCurrency,
  getHideAmounts,
  getLastSyncedAt,
  saveCurrency,
  saveHideAmounts,
  setLastSyncedAt,
} from '@/lib/db'
import type { Timeline } from '@/lib/benchmark'
import { formatDateTime, localToday, setHideAmounts, type Currency } from '@/lib/format'
import { clientId, disconnect, getAccessToken, hasValidToken, loadGoogleIdentity } from '@/lib/google/auth'
import { WrongPasswordError } from '@/lib/pdf'
import { syncFromGmail, type SyncProgress } from '@/lib/sync'

export default function App() {
  // The birthdate lives only in this component's memory: never stored, never
  // sent anywhere. Reloading the page forgets it.
  const [birthdateDigits, setBirthdateDigits] = useState('')
  const [connected, setConnected] = useState(hasValidToken())
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wrongBirthdate, setWrongBirthdate] = useState(false)
  const [noEmailsFound, setNoEmailsFound] = useState(false)
  // Returning users land on their dashboard; "sync" takes them back through the steps.
  const [setupOpen, setSetupOpen] = useState(false)
  // The eye button: hide money amounts and share counts, keep percentages.
  const [hideAmounts, setHide] = useState(getHideAmounts)
  setHideAmounts(hideAmounts)

  // The ฿ / $ switch: USD figures are exact; baht ones include exchange-rate moves.
  const [currency, setCurrency] = useState<Currency>(getCurrency)

  function chooseCurrency(next: Currency) {
    saveCurrency(next)
    setCurrency(next)
  }

  // The latest prices, from the dashboard, so the Excel export includes today's values.
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [exporting, setExporting] = useState(false)

  async function exportExcel() {
    if (!transactions) return
    setExporting(true)
    try {
      const { exportToExcel } = await import('@/lib/exportExcel')
      await exportToExcel(transactions, timeline, localToday())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  function toggleHideAmounts() {
    saveHideAmounts(!hideAmounts)
    setHide(!hideAmounts)
  }

  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const [syncedAt, setSyncedAt] = useState(getLastSyncedAt)
  // Before sync times were recorded: when the newest email was read.
  const lastEmailReadAt = useLiveQuery(async () => {
    const messages = await db.processedMessages.toArray()
    return messages.reduce<string | null>(
      (latest, m) => (!latest || m.processedAt > latest ? m.processedAt : latest),
      null,
    )
  }, [])
  const lastSynced = syncedAt ?? lastEmailReadAt ?? null
  const unparsedCount = transactions?.filter((tx) => tx.parseStatus === 'unparsed').length ?? 0
  const hasData = !!transactions && transactions.length > 0

  useEffect(() => {
    if (clientId) loadGoogleIdentity().catch((e: Error) => setError(e.message))
  }, [])

  async function connect() {
    setConnecting(true)
    setError(null)
    try {
      await getAccessToken()
      setConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }

  async function sync() {
    const birthdate = parseBirthdate(birthdateDigits)
    if (!birthdate) {
      setSetupOpen(true)
      return
    }
    setSyncing(true)
    setError(null)
    setWrongBirthdate(false)
    setNoEmailsFound(false)
    setProgress(null)
    try {
      const accessToken = await getAccessToken()
      setConnected(true)
      await syncFromGmail(accessToken, birthdate.password, setProgress)
      const now = new Date().toISOString()
      setLastSyncedAt(now)
      setSyncedAt(now)
      if ((await db.transactions.count()) > 0) setSetupOpen(false)
      else setNoEmailsFound(true)
    } catch (e) {
      if (e instanceof WrongPasswordError) setWrongBirthdate(true)
      else setError(e instanceof Error ? e.message : String(e))
      setSetupOpen(true)
    } finally {
      setSyncing(false)
    }
  }

  /** From the dashboard: sync straight away if Gmail and the birthdate are ready, else walk the steps. */
  function syncFromDashboard() {
    setProgress(null)
    if (connected && hasValidToken() && parseBirthdate(birthdateDigits)) void sync()
    else setSetupOpen(true)
  }

  async function handleDisconnect() {
    await disconnect()
    setConnected(false)
  }

  async function handleClear() {
    if (!confirm('ลบรายการซื้อขายทั้งหมดที่เก็บไว้ในเบราว์เซอร์นี้? คุณซิงก์จาก Gmail ใหม่ได้ทุกเมื่อ')) return
    await clearLocalData()
    setSyncedAt(null)
    setProgress(null)
    setSetupOpen(false)
  }

  // Wait for the local database before choosing a view, so returning users don't see the steps flash.
  if (transactions === undefined) return null

  const showSetup = setupOpen || !hasData
  const step = connected ? 2 : 1

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 pt-8 pb-12 sm:pt-12">
      {!clientId && (
        <Alert variant="destructive" className="paper">
          <AlertTitle>ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google</AlertTitle>
          <AlertDescription>
            <p>
              ตั้งค่า <code>VITE_GOOGLE_CLIENT_ID</code> ใน <code>.env.local</code> แล้วรีสตาร์ทเซิร์ฟเวอร์
              ดูรายละเอียดใน README
            </p>
          </AlertDescription>
        </Alert>
      )}

      {showSetup ? (
        <div className="mx-auto max-w-xl space-y-8">
          {hasData ? (
            <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setSetupOpen(false)}>
              <ArrowLeft aria-hidden />
              กลับไปดูพอร์ต
            </Button>
          ) : (
            <header className="space-y-4">
              <div className="space-y-2">
                <p className="text-brand text-sm font-semibold">ส่องพอร์ต Dime</p>
                <h1 className="font-display text-[1.75rem] leading-tight font-medium sm:text-4xl">
                  สรุปพอร์ตจากอีเมลของคุณ
                </h1>
              </div>
              <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
                กำไรขาดทุนทั้งพอร์ต อัตราชนะ และผลตอบแทนเทียบกับ S&P 500 คำนวณจากอีเมลยืนยันการซื้อขายใน Gmail ของคุณ
                ใช้ฟรี ไม่ต้องสมัครสมาชิก
              </p>
            </header>
          )}

          <Stepper current={step} />

          {step === 1 ? (
            <ConnectStep onConnect={() => void connect()} connecting={connecting} disabled={!clientId} />
          ) : (
            <BirthdateStep
              digits={birthdateDigits}
              onDigitsChange={(digits) => {
                setBirthdateDigits(digits)
                setWrongBirthdate(false)
              }}
              onSubmit={() => void sync()}
              syncing={syncing}
              progress={progress}
              wrongBirthdate={wrongBirthdate}
            />
          )}

          {noEmailsFound && (
            <Alert className="paper">
              <AlertTitle>ไม่พบอีเมลจาก Dime! ใน Gmail นี้</AlertTitle>
              <AlertDescription>
                ตรวจสอบว่าเชื่อมต่อบัญชี Gmail ที่ใช้รับใบยืนยันการซื้อขายจาก Dime!{' '}
                <button className="underline underline-offset-2" onClick={() => void handleDisconnect()}>
                  เปลี่ยนบัญชี
                </button>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="paper">
              <AlertTitle>ทำต่อไม่ได้</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {connected && (
            <p className="text-muted-foreground text-sm">
              เชื่อมต่อ Gmail แล้ว (อ่านอย่างเดียว){' '}
              <button className="underline underline-offset-2" onClick={() => void handleDisconnect()}>
                ยกเลิกการเชื่อมต่อ
              </button>
            </p>
          )}

          <div className="border-t pt-8">
            <DataPath />
          </div>
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-brand text-sm font-semibold">ส่องพอร์ต Dime</p>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-medium sm:text-3xl">พอร์ตของคุณ</h1>
                <button
                  type="button"
                  onClick={toggleHideAmounts}
                  className="text-muted-foreground hover:text-foreground hover:bg-card rounded-full p-2 transition-colors"
                  aria-label={hideAmounts ? 'แสดงตัวเลข' : 'ซ่อนตัวเลข'}
                  aria-pressed={hideAmounts}
                  title={hideAmounts ? 'แสดงตัวเลข' : 'ซ่อนตัวเลข'}
                >
                  {hideAmounts ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                </button>
                <div
                  className="bg-card ml-1 flex rounded-full p-0.5 text-sm shadow-[0_1px_2px_rgb(120_60_20/0.08)]"
                  role="group"
                  aria-label="สกุลเงิน"
                >
                  {(['฿', '$'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => chooseCurrency(c)}
                      aria-pressed={currency === c}
                      title={c === '฿' ? 'แสดงเป็นเงินบาท' : 'แสดงเป็นดอลลาร์ (ตรงกับยอด USD ในแอป Dime!)'}
                      className={`min-w-8 rounded-full px-2.5 py-0.5 font-semibold transition-colors ${
                        currency === c ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {lastSynced && <p className="text-muted-foreground text-sm">ซิงก์ล่าสุด {formatDateTime(lastSynced)}</p>}
            </div>
            <Button variant="outline" className="bg-card rounded-full" onClick={syncFromDashboard} disabled={syncing}>
              <RefreshCw className={syncing ? 'animate-spin' : undefined} aria-hidden />
              {syncing ? 'กำลังดึงอีเมลใหม่…' : 'ดึงอีเมลใหม่'}
            </Button>
          </header>

          {syncing && progress && <SyncStatus progress={progress} />}

          {transactions.length > unparsedCount && (
            <Dashboard
              transactions={transactions}
              hideAmounts={hideAmounts}
              currency={currency}
              onTimeline={setTimeline}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>รายการซื้อขาย</CardTitle>
              <CardDescription>
                {`${transactions.length - unparsedCount} รายการ` +
                  (unparsedCount ? ` · อ่าน PDF ไม่ได้ ${unparsedCount} ไฟล์` : '')}
              </CardDescription>
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => void exportExcel()}
                  disabled={exporting}
                >
                  <FileSpreadsheet aria-hidden />
                  {exporting ? 'กำลังสร้างไฟล์…' : 'ส่งออก Excel'}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <TransactionsTable transactions={transactions} />
            </CardContent>
          </Card>
        </>
      )}

      <Support className={showSetup ? 'mx-auto max-w-xl' : 'max-w-xl'} />

      <footer className={`text-muted-foreground space-y-1 text-xs ${showSetup ? 'mx-auto max-w-xl' : ''}`}>
        <p>
          <a className="underline underline-offset-2" href="/privacy">
            นโยบายความเป็นส่วนตัว
          </a>
          {' · '}
          <a
            className="underline underline-offset-2"
            href="https://github.com/dreamnattapat/dime-portfolio-tracker"
            target="_blank"
            rel="noreferrer"
          >
            ซอร์สโค้ด
          </a>
          {hasData && (
            <>
              {' · '}
              <button className="underline underline-offset-2" onClick={() => void handleClear()}>
                ลบข้อมูลในเครื่อง
              </button>
            </>
          )}
        </p>
        <p>เว็บไซต์นี้ไม่มีส่วนเกี่ยวข้องกับ Dime! หรือ KKP Dime Securities Company Limited</p>
      </footer>
    </main>
  )
}
