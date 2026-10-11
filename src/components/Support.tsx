import { Coffee, Download } from 'lucide-react'

/**
 * A PromptPay QR for tips. Most visitors are on the same phone that shows the
 * QR, so they can't scan it: they save the image and open it in their bank
 * app's "scan from photo" instead.
 */
export function Support({ className = '' }: { className?: string }) {
  return (
    <details className={`group bg-card rounded-2xl border px-5 py-4 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="bg-brand-soft text-brand flex size-10 shrink-0 items-center justify-center rounded-full">
          <Coffee className="size-5" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">ชอบส่องพอร์ต Dime ไหม?</span>
          <span className="text-muted-foreground block text-sm">เลี้ยงกาแฟคนทำได้ผ่านพร้อมเพย์</span>
        </span>
        <span className="text-brand text-sm font-medium group-open:hidden">เลี้ยงกาแฟ</span>
        <span className="text-muted-foreground hidden text-sm group-open:inline">ปิด</span>
      </summary>
      <div className="mt-4 flex flex-col items-center gap-3 border-t pt-4 text-center">
        <img
          src="/promptpay-qr.jpg"
          alt="QR พร้อมเพย์สำหรับเลี้ยงกาแฟ"
          width={590}
          height={924}
          loading="lazy"
          className="w-56 rounded-xl border"
        />
        <a
          href="/promptpay-qr.jpg"
          download="songport-promptpay-qr.jpg"
          className="text-brand inline-flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
        >
          <Download className="size-4" aria-hidden />
          บันทึกรูป QR
        </a>
        <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
          ใช้มือถือเครื่องนี้อยู่? บันทึกรูป QR แล้วเปิดแอปธนาคาร เลือกสแกนจากรูปภาพ ใส่จำนวนเท่าไรก็ได้ ขอบคุณมากครับ
        </p>
      </div>
    </details>
  )
}
