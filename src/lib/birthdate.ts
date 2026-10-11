/**
 * The birthdate that unlocks Dime!'s PDFs: DDMMYYYY with a Gregorian year.
 * Many Thai users think in Buddhist Era years, so a BE year (25xx) is
 * converted rather than rejected.
 */

const BUDDHIST_ERA_OFFSET = 543

export type Birthdate = {
  /** The PDF password, DDMMYYYY with a Gregorian year. */
  password: string
  date: Date
  /** The user typed a Buddhist Era year and it was converted. */
  convertedFromBuddhistEra: boolean
}

/** Parses 8 digits (DDMMYYYY); null if incomplete or not a real past date. */
export function parseBirthdate(digits: string, today = new Date()): Birthdate | null {
  if (!/^\d{8}$/.test(digits)) return null
  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  let year = Number(digits.slice(4))
  const convertedFromBuddhistEra = year >= 2400
  if (convertedFromBuddhistEra) year -= BUDDHIST_ERA_OFFSET
  if (year < 1900 || year > today.getFullYear()) return null

  const date = new Date(year, month - 1, day)
  if (date.getMonth() !== month - 1 || date.getDate() !== day || date > today) return null
  return { password: `${digits.slice(0, 4)}${year}`, date, convertedFromBuddhistEra }
}

/** "05031995" -> "05/03/1995", for display while typing. */
export function formatBirthdateInput(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/')
}

const longDate = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' })

export function formatBirthdate(date: Date): string {
  return longDate.format(date)
}
