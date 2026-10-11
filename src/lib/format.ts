/**
 * "Hide amounts" (the eye button): money and share counts render as a mask,
 * percentages stay visible. A module flag rather than React state, so every
 * formatter honours it; the app sets it on each render and re-renders on toggle.
 */
export const MASK = '******'
let hideAmounts = false

export function setHideAmounts(hide: boolean): void {
  hideAmounts = hide
}

const numberFormats = new Map<number, Intl.NumberFormat>()

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '—'
  let format = numberFormats.get(decimals)
  if (!format) {
    format = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    numberFormats.set(decimals, format)
  }
  return format.format(value)
}

/** An amount of money as a plain number (no currency sign); masked when amounts are hidden. */
export function formatAmount(value: number | null | undefined, decimals = 2): string {
  return hideAmounts && value != null ? MASK : formatNumber(value, decimals)
}

/** Units are fractional with up to 7 decimals; show only the ones in use. */
export function formatUnits(value: number): string {
  if (hideAmounts) return MASK
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 }).format(value)
}

// Thai month names, Gregorian years (as on Dime!'s confirmations).
const dateFormat = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: '2-digit', month: 'short', year: 'numeric' })

/** "2026-08-27" or a full ISO timestamp -> "27 ส.ค. 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return dateFormat.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso))
}

const wholeFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export type Currency = '฿' | '$'

/** 1234567.8 -> "฿1,234,568"; negative as "-฿1,234,568". Whole units. */
export function formatMoney(value: number | null | undefined, currency: Currency): string {
  if (value == null) return '—'
  if (hideAmounts) return MASK
  return `${value < 0 ? '-' : ''}${currency}${wholeFormat.format(Math.abs(value))}`
}

/** Like formatMoney, with "+" on gains. */
export function formatSignedMoney(value: number | null | undefined, currency: Currency): string {
  if (value == null) return '—'
  if (hideAmounts) return MASK
  return value > 0 ? `+${formatMoney(value, currency)}` : formatMoney(value, currency)
}

/** 1234567 -> "$1.2M", for chart axes. */
export function formatCompactMoney(value: number, currency: Currency): string {
  if (hideAmounts) return '***'
  return `${value < 0 ? '-' : ''}${currency}${compactFormat.format(Math.abs(value))}`
}

export const formatThb = (value: number | null | undefined) => formatMoney(value, '฿')
export const formatSignedThb = (value: number | null | undefined) => formatSignedMoney(value, '฿')

export function formatPercent(value: number | null | undefined, { signed = false, decimals = 1 } = {}): string {
  if (value == null) return '—'
  return `${signed && value > 0 ? '+' : ''}${formatNumber(value, decimals)}%`
}

const dateTimeFormat = new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** ms since epoch or ISO timestamp -> "10 ต.ค. 2026 03:00", in the user's time zone. */
export function formatDateTime(value: number | string | null | undefined): string {
  if (value == null) return '—'
  return dateTimeFormat.format(new Date(value))
}

/** Today's date where the user is, as YYYY-MM-DD. */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}
