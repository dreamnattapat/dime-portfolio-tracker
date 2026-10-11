import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Dashboard } from '@/components/Dashboard'
import { BirthdateStep, ConnectStep, DataPath, Stepper, SyncStatus } from '@/components/Onboarding'
import { TransactionsTable } from '@/components/TransactionsTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { parseBirthdate } from '@/lib/birthdate'
import { clearLocalData, db, getLastSyncedAt, setLastSyncedAt } from '@/lib/db'
import { formatDateTime } from '@/lib/format'
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
        <Alert variant="destructive">
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
            <header className="space-y-3">
              <p className="text-brand text-sm font-semibold">ส่องพอร์ต Dime</p>
              <h1 className="text-[1.75rem] leading-tight font-semibold sm:text-4xl">สรุปพอร์ตจากอีเมลของคุณ</h1>
              <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
                กำไรขาดทุนทั้งพอร์ต อัตราชนะ และผลตอบแทนเทียบกับ S&P 500 คำนวณจากอีเมลยืนยันการซื้อขายใน Gmail
                ของคุณ ใช้ฟรี ไม่ต้องสมัครสมาชิก
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
            <Alert>
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
            <Alert variant="destructive">
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
              <h1 className="text-2xl font-semibold sm:text-3xl">พอร์ตของคุณ</h1>
              {lastSynced && <p className="text-muted-foreground text-sm">ซิงก์ล่าสุด {formatDateTime(lastSynced)}</p>}
            </div>
            <Button variant="outline" onClick={syncFromDashboard} disabled={syncing}>
              <RefreshCw className={syncing ? 'animate-spin' : undefined} aria-hidden />
              {syncing ? 'กำลังดึงอีเมลใหม่…' : 'ดึงอีเมลใหม่'}
            </Button>
          </header>

          {syncing && progress && <SyncStatus progress={progress} />}

          {transactions.length > unparsedCount && <Dashboard transactions={transactions} lastSynced={null} />}

          <Card>
            <CardHeader>
              <CardTitle>รายการซื้อขาย</CardTitle>
              <CardDescription>
                {`${transactions.length - unparsedCount} รายการ` +
                  (unparsedCount ? ` · อ่าน PDF ไม่ได้ ${unparsedCount} ไฟล์` : '')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionsTable transactions={transactions} />
            </CardContent>
          </Card>
        </>
      )}

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
