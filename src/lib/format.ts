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

/** Units are fractional with up to 7 decimals; show only the ones in use. */
export function formatUnits(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 }).format(value)
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

/** "2026-08-27" or a full ISO timestamp -> "27 Aug 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return dateFormat.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso))
}

const thbFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/** 1234567.8 -> "฿1,234,568"; negative as "-฿1,234,568". */
export function formatThb(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value < 0 ? '-' : ''}฿${thbFormat.format(Math.abs(value))}`
}

/** Like formatThb, with "+" on gains. */
export function formatSignedThb(value: number | null | undefined): string {
  if (value == null) return '—'
  return value > 0 ? `+${formatThb(value)}` : formatThb(value)
}

/** 1234567 -> "฿1.2M", for chart axes. */
export function formatCompactThb(value: number): string {
  return `${value < 0 ? '-' : ''}฿${compactFormat.format(Math.abs(value))}`
}

export function formatPercent(value: number | null | undefined, { signed = false, decimals = 1 } = {}): string {
  if (value == null) return '—'
  return `${signed && value > 0 ? '+' : ''}${formatNumber(value, decimals)}%`
}

/** Today's date where the user is, as YYYY-MM-DD. */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}
