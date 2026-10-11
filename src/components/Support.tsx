import { ChevronDown, Coffee, Download } from "lucide-react";

/**
 * A PromptPay QR for tips. Most visitors are on the same phone that shows the
 * QR, so they can't scan it: they save the image and open it in their bank
 * app's "scan from photo" instead.
 */
export function Support({ className = "" }: { className?: string }) {
  return (
    <div className={`slip-shadow ${className}`}>
      <details className="group paper torn-bottom rounded-t-sm px-5 pt-4 pb-[calc(1rem+7px)]">
        <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          {/* Coffee brown, set apart from the blue used for the app itself. */}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f3e6da] text-[#7a4527]">
            <Coffee className="size-5" aria-hidden />
          </span>
          <span className="flex-1 font-semibold">BUY ME A COFFEE</span>
          <ChevronDown
            className="text-muted-foreground size-5 transition-transform group-open:rotate-180"
            aria-hidden
          />
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
            ใช้มือถือเครื่องนี้อยู่? บันทึกรูป QR แล้วเปิดแอปธนาคาร
            เลือกสแกนจากรูปภาพ ใส่จำนวนเท่าไรก็ได้ ขอบคุณมากครับ
          </p>
        </div>
      </details>
    </div>
  );
}
