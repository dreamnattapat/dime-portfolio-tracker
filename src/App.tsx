import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'

import { Dashboard } from '@/components/Dashboard'
import { TransactionsTable } from '@/components/TransactionsTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { clearLocalData, db, getLastSyncedAt, setLastSyncedAt } from '@/lib/db'
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
      const now = new Date().toISOString()
      setLastSyncedAt(now)
      setSyncedAt(now)
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
    if (!confirm('ลบรายการซื้อขายทั้งหมดที่เก็บไว้ในเบราว์เซอร์นี้? คุณซิงก์จาก Gmail ใหม่ได้ทุกเมื่อ')) return
    await clearLocalData()
    setSyncedAt(null)
    setProgress(null)
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Dime! Portfolio Tracker</h1>
        <p className="text-muted-foreground max-w-2xl">
          รายการซื้อขาย Dime! จาก Gmail ของคุณ วิเคราะห์ในเบราว์เซอร์นี้ ไม่มีข้อมูลถูกส่งไปที่ใดนอกจาก Google
        </p>
      </header>

      {!clientId && (
        <Alert variant="destructive">
          <AlertTitle>ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google</AlertTitle>
          <AlertDescription>
            <p>
              ตั้งค่า <code>VITE_GOOGLE_CLIENT_ID</code> ใน <code>.env.local</code> แล้วรีสตาร์ทเซิร์ฟเวอร์ ดูรายละเอียดใน
              README
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ซิงก์จาก Gmail</CardTitle>
          <CardDescription>ใช้วันเกิดของคุณเพื่อเปิดไฟล์ PDF ของ Dime! และจะไม่ถูกบันทึกไว้</CardDescription>
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
              <span className="text-sm font-medium">วันเกิด ปี ค.ศ. (DDMMYYYY)</span>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                placeholder="เช่น 05031995"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <Button type="submit" disabled={!clientId || !passwordValid || syncing}>
              {syncing ? 'กำลังซิงก์…' : connected ? 'ซิงก์อีเมลใหม่' : 'เชื่อมต่อ Gmail และซิงก์'}
            </Button>
          </form>

          {!connected && (
            <details className="text-muted-foreground text-sm">
              <summary className="cursor-pointer">Google แจ้งว่า "Google ยังไม่ได้ยืนยันแอปนี้" ใช่ไหม?</summary>
              <div className="mt-2 space-y-2">
                <p>
                  เป็นเรื่องปกติ เพราะแอปนี้ยังอยู่ระหว่างการตรวจสอบของ Google หากต้องการดำเนินการต่อ ให้คลิก{' '}
                  <strong>ขั้นสูง (Advanced)</strong> แล้วคลิก <strong>ไปที่ … (ไม่ปลอดภัย)</strong> และอนุญาตให้อ่าน Gmail
                  ของคุณ
                </p>
                <p>
                  สิทธิ์นี้เป็นแบบอ่านอย่างเดียวและอยู่ในเบราว์เซอร์นี้เท่านั้น อีเมลถูกดึงจาก Google มายังหน้านี้โดยตรง
                  และการตั้งค่าความปลอดภัยของเว็บไซต์ป้องกันไม่ให้หน้านี้ส่งข้อมูลไปที่อื่น คุณตรวจสอบ{' '}
                  <a
                    className="underline underline-offset-2"
                    href="https://github.com/dreamnattapat/dime-portfolio-tracker"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ซอร์สโค้ด
                  </a>{' '}
                  ได้ และยกเลิกสิทธิ์ได้ทุกเมื่อจาก{' '}
                  <a
                    className="underline underline-offset-2"
                    href="https://myaccount.google.com/connections"
                    target="_blank"
                    rel="noreferrer"
                  >
                    บัญชี Google
                  </a>{' '}
                  ของคุณ
                </p>
              </div>
            </details>
          )}

          {connected && (
            <p className="text-muted-foreground text-sm">
              เชื่อมต่อ Gmail แล้ว (อ่านอย่างเดียว){' '}
              <button className="underline underline-offset-2" onClick={handleDisconnect}>
                ยกเลิกการเชื่อมต่อ
              </button>
            </p>
          )}

          {progress && (
            <div className="space-y-1.5">
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 100} />
              <p className="text-muted-foreground text-sm">
                {progress.total === 0
                  ? 'ไม่มีอีเมล Dime! ใหม่'
                  : `อ่านอีเมลใหม่แล้ว ${progress.done} จาก ${progress.total} ฉบับ · เพิ่ม ${progress.added} รายการ` +
                    (progress.failed ? ` · ล้มเหลว ${progress.failed} ฉบับ (จะลองใหม่ในการซิงก์ครั้งถัดไป)` : '')}
              </p>
              {progress.firstError && (
                <p className="text-destructive text-sm">ข้อผิดพลาดแรก: {progress.firstError}</p>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>การซิงก์หยุดลง</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {transactions && transactions.length > unparsedCount && (
        <Dashboard transactions={transactions} lastSynced={lastSynced} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>รายการซื้อขาย</CardTitle>
          <CardDescription>
            {transactions === undefined
              ? 'กำลังโหลด…'
              : `${transactions.length - unparsedCount} รายการ` +
                (unparsedCount ? ` · อ่าน PDF ไม่ได้ ${unparsedCount} ไฟล์` : '')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions?.length ? (
            <TransactionsTable transactions={transactions} />
          ) : (
            transactions && (
              <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูล กดซิงก์เพื่อดึงรายการซื้อขาย Dime! ของคุณ</p>
            )
          )}
        </CardContent>
      </Card>

      <footer className="text-muted-foreground space-y-1 text-xs">
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
          {transactions?.length ? (
            <>
              {' · '}
              <button className="underline underline-offset-2" onClick={handleClear}>
                ลบข้อมูลในเครื่อง
              </button>
            </>
          ) : null}
        </p>
        <p>เว็บไซต์นี้ไม่มีส่วนเกี่ยวข้องกับ Dime! หรือ KKP Dime Securities Company Limited</p>
      </footer>
    </main>
  )
}
