import { Check, Eye, FileLock2, LaptopMinimal, LockKeyhole, Mail, Server, ShieldCheck, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatBirthdate, formatBirthdateInput, parseBirthdate } from '@/lib/birthdate'
import { EMAIL_SUBJECT } from '@/lib/google/gmail'
import type { SyncProgress } from '@/lib/sync'

export type Step = 1 | 2 | 3

const STEPS = ['เชื่อมต่อ Gmail', 'ใส่วันเกิด', 'ดูพอร์ต'] as const

/** Where the user is in connect → birthdate → dashboard. */
export function Stepper({ current }: { current: Step }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="ขั้นตอน">
      {STEPS.map((label, i) => {
        const step = (i + 1) as Step
        const done = step < current
        const active = step === current
        return (
          <li key={label} className="space-y-2" aria-current={active ? 'step' : undefined}>
            <div className={`h-1 rounded-full ${done || active ? 'bg-brand' : 'bg-border'}`} />
            <div className="flex items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done ? 'bg-brand text-desk' : active ? 'border-brand text-brand border-2' : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? <Check className="size-3.5" aria-label="เสร็จแล้ว" /> : step}
              </span>
              <span className={`text-sm leading-tight ${active ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function StepPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="slip-shadow">
      <section className="paper torn-bottom space-y-5 rounded-t-sm p-5 pb-[calc(1.25rem+7px)] sm:p-7 sm:pb-[calc(1.75rem+7px)]">
        <h2 className="text-xl font-semibold">{title}</h2>
        {children}
      </section>
    </div>
  )
}

export function ConnectStep({
  onConnect,
  connecting,
  disabled,
}: {
  onConnect: () => void
  connecting: boolean
  disabled: boolean
}) {
  return (
    <StepPanel title="เชื่อมต่อ Gmail ที่ใช้รับอีเมลจาก Dime!">
      <p className="text-muted-foreground">
        เว็บนี้ค้นหาเฉพาะอีเมลหัวข้อ “{EMAIL_SUBJECT}” เพื่อดึงไฟล์ใบยืนยันการซื้อขาย สิทธิ์เป็นแบบอ่านอย่างเดียว
        จึงส่ง ลบ หรือแก้ไขอีเมลของคุณไม่ได้
      </p>
      <Button size="lg" className="bg-brand hover:bg-brand/90 h-12 w-full text-base text-white" onClick={onConnect} disabled={disabled || connecting}>
        <Mail className="size-5" aria-hidden />
        {connecting ? 'กำลังรอ Google…' : 'เชื่อมต่อ Gmail'}
      </Button>
      <details className="text-muted-foreground text-sm">
        <summary className="cursor-pointer">Google แจ้งว่า “Google ยังไม่ได้ยืนยันแอปนี้” ใช่ไหม?</summary>
        <div className="mt-2 space-y-2">
          <p>
            เป็นเรื่องปกติ เพราะแอปนี้ยังอยู่ระหว่างการตรวจสอบของ Google ให้แตะ <strong>ขั้นสูง (Advanced)</strong>{' '}
            แล้วแตะ <strong>ไปที่ … (ไม่ปลอดภัย)</strong> และอนุญาตให้อ่าน Gmail
          </p>
          <p>
            ยกเลิกสิทธิ์ได้ทุกเมื่อที่{' '}
            <a className="underline underline-offset-2" href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
              บัญชี Google ของคุณ
            </a>
          </p>
        </div>
      </details>
    </StepPanel>
  )
}

export function BirthdateStep({
  digits,
  onDigitsChange,
  onSubmit,
  syncing,
  progress,
  wrongBirthdate,
}: {
  digits: string
  onDigitsChange: (digits: string) => void
  onSubmit: () => void
  syncing: boolean
  progress: SyncProgress | null
  wrongBirthdate: boolean
}) {
  const parsed = parseBirthdate(digits)
  const invalid = digits.length === 8 && !parsed

  return (
    <StepPanel title="ใส่วันเกิดเพื่อเปิดไฟล์ PDF">
      <p className="text-muted-foreground">
        Dime! ล็อกไฟล์ใบยืนยันการซื้อขายด้วยวันเกิดของคุณ วันเกิดใช้แค่เปิดไฟล์ในเครื่องนี้ ไม่ถูกบันทึกหรือส่งไปที่ใด
        และจะถูกลืมเมื่อปิดหน้านี้
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (parsed) onSubmit()
        }}
      >
        <label className="block space-y-2">
          <span className="text-sm font-medium">วัน/เดือน/ปีเกิด</span>
          <Input
            className="h-12 text-lg tracking-wider tabular-nums md:text-lg"
            inputMode="numeric"
            autoComplete="off"
            placeholder="วว/ดด/ปปปป"
            value={formatBirthdateInput(digits)}
            aria-invalid={invalid || wrongBirthdate}
            aria-describedby="birthdate-hint"
            onChange={(e) => onDigitsChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
            disabled={syncing}
          />
          <span id="birthdate-hint" className="block min-h-5 text-sm">
            {wrongBirthdate ? (
              <span className="text-destructive">วันเกิดนี้เปิดไฟล์ไม่ได้ ลองตรวจสอบอีกครั้ง</span>
            ) : invalid ? (
              <span className="text-destructive">วันที่ไม่ถูกต้อง</span>
            ) : parsed ? (
              <span className="text-muted-foreground">
                {formatBirthdate(parsed.date)}
                {parsed.convertedFromBuddhistEra && ' (แปลงจากปี พ.ศ. ให้แล้ว)'}
              </span>
            ) : (
              <span className="text-muted-foreground">ใส่ปี ค.ศ. หรือ พ.ศ. ก็ได้</span>
            )}
          </span>
        </label>
        <Button
          type="submit"
          size="lg"
          className="bg-brand hover:bg-brand/90 h-12 w-full text-base text-white"
          disabled={!parsed || syncing}
        >
          <FileLock2 className="size-5" aria-hidden />
          {syncing ? 'กำลังอ่านอีเมล…' : 'เปิดไฟล์และดูพอร์ต'}
        </Button>
      </form>
      {progress && <SyncStatus progress={progress} />}
    </StepPanel>
  )
}

export function SyncStatus({ progress }: { progress: SyncProgress }) {
  return (
    <div className="space-y-1.5">
      <Progress value={progress.total ? (progress.done / progress.total) * 100 : 100} />
      <p className="text-muted-foreground text-sm">
        {progress.total === 0
          ? 'ไม่มีอีเมล Dime! ใหม่'
          : `อ่านอีเมลแล้ว ${progress.done} จาก ${progress.total} ฉบับ`}
        {progress.failed ? ` ล้มเหลว ${progress.failed} ฉบับ (จะลองใหม่ครั้งหน้า)` : ''}
      </p>
      {progress.firstError && <p className="text-destructive text-sm">ข้อผิดพลาดแรก: {progress.firstError}</p>}
    </div>
  )
}

/** Where the data goes: Gmail to this device, never to the site's server. */
export function DataPath() {
  return (
    <section className="space-y-5" aria-labelledby="data-path-title">
      <h2 id="data-path-title" className="text-lg font-semibold">
        ข้อมูลของคุณอยู่ในเครื่องคุณเท่านั้น
      </h2>
      <figure className="space-y-3">
        <div className="flex items-start justify-between gap-1" aria-hidden>
          <Node icon={<Mail />} label="Gmail" />
          <Link />
          <Node icon={<LaptopMinimal />} label="เครื่องของคุณ" highlight />
          <Link blocked />
          <Node icon={<Server />} label="เซิร์ฟเวอร์ของเว็บ" muted />
        </div>
        <figcaption className="text-muted-foreground text-sm">
          อีเมลถูกดึงจาก Google มาที่เบราว์เซอร์ของคุณโดยตรง คำนวณและเก็บไว้ในเครื่องนี้
          ส่วนเซิร์ฟเวอร์ของเว็บนี้เห็นเพียงชื่อหุ้นเพื่อดึงราคาตลาด ไม่เห็นอีเมล วันเกิด หรือรายการซื้อขาย
        </figcaption>
      </figure>
      <ul className="space-y-3 text-sm">
        <Fact icon={<Eye />} title="อ่านอย่างเดียว">
          ส่ง ลบ หรือแก้ไขอีเมลไม่ได้ และยกเลิกสิทธิ์ได้ทุกเมื่อ
        </Fact>
        <Fact icon={<LockKeyhole />} title="วันเกิดไม่ถูกบันทึก">
          ใช้เปิดไฟล์ PDF แล้วลืมทันทีเมื่อปิดหน้า
        </Fact>
        <Fact icon={<ShieldCheck />} title="ตรวจสอบได้">
          การตั้งค่าความปลอดภัยของเว็บบังคับให้เบราว์เซอร์ส่งข้อมูลไปได้แค่ Google และเว็บนี้ และ
          <a
            className="underline underline-offset-2"
            href="https://github.com/dreamnattapat/dime-portfolio-tracker"
            target="_blank"
            rel="noreferrer"
          >
            ซอร์สโค้ดเปิดให้ดูได้
          </a>
        </Fact>
      </ul>
    </section>
  )
}

function Node({ icon, label, highlight, muted }: { icon: ReactNode; label: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-2 text-center">
      <span
        className={`flex size-12 items-center justify-center rounded-2xl [&_svg]:size-6 ${
          highlight ? 'bg-brand text-desk' : muted ? 'bg-muted text-muted-foreground/60' : 'bg-brand-soft text-brand'
        }`}
      >
        {icon}
      </span>
      <span className={`text-xs leading-snug ${muted ? 'text-muted-foreground' : 'font-medium'}`}>
        {label}
      </span>
    </div>
  )
}

/** The connector between two nodes: a flowing line, or a broken one with an ✕. */
function Link({ blocked }: { blocked?: boolean }) {
  return (
    <div className="relative mt-6 h-0.5 flex-1">
      {blocked ? (
        <>
          <div className="border-muted-foreground/40 absolute inset-x-0 top-0 border-t-2 border-dashed" />
          <span className="bg-background text-destructive absolute top-1/2 left-1/2 flex size-5 -translate-1/2 items-center justify-center rounded-full">
            <X className="size-4" strokeWidth={3} />
          </span>
        </>
      ) : (
        <div className="data-flow absolute inset-0 rounded-full" />
      )}
    </div>
  )
}

function Fact({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-brand mt-0.5 shrink-0 [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground"> {children}</span>
      </span>
    </li>
  )
}
