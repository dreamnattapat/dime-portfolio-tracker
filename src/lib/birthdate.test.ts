import { describe, expect, it } from 'vitest'

import { formatBirthdateInput, parseBirthdate } from '@/lib/birthdate'

const today = new Date(2026, 9, 11)

describe('parseBirthdate', () => {
  it('keeps a Gregorian date as the password', () => {
    expect(parseBirthdate('05031995', today)).toMatchObject({ password: '05031995', convertedFromBuddhistEra: false })
  })

  it('converts a Buddhist Era year', () => {
    expect(parseBirthdate('05032538', today)).toMatchObject({ password: '05031995', convertedFromBuddhistEra: true })
  })

  it('rejects incomplete and impossible dates', () => {
    expect(parseBirthdate('0503199', today)).toBeNull()
    expect(parseBirthdate('31021995', today)).toBeNull()
    expect(parseBirthdate('00131995', today)).toBeNull()
    expect(parseBirthdate('05031850', today)).toBeNull()
    expect(parseBirthdate('01012030', today)).toBeNull()
  })
})

describe('formatBirthdateInput', () => {
  it('adds slashes as digits arrive', () => {
    expect(formatBirthdateInput('05')).toBe('05')
    expect(formatBirthdateInput('0503')).toBe('05/03')
    expect(formatBirthdateInput('050319')).toBe('05/03/19')
  })
})
