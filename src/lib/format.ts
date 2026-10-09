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
