import { afterEach, describe, expect, it, vi } from 'vitest'

import { findDimeMessageIds, GmailError } from './gmail'

const quotaError = () =>
  new Response(JSON.stringify({ error: { message: 'Quota exceeded', errors: [{ reason: 'rateLimitExceeded' }] } }), {
    status: 429,
  })
const listResponse = () => new Response(JSON.stringify({ messages: [{ id: 'a' }] }))

describe('gmailGet rate limiting', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries after a rate-limit response', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(quotaError()).mockResolvedValueOnce(listResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = findDimeMessageIds('token')
    await vi.runAllTimersAsync()

    expect(await result).toEqual(['a'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up once the retries run out', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation(async () => quotaError())
    vi.stubGlobal('fetch', fetchMock)

    const result = findDimeMessageIds('token')
    const assertion = expect(result).rejects.toThrow(GmailError)
    await vi.runAllTimersAsync()

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it('does not retry other errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(findDimeMessageIds('token')).rejects.toThrow('Invalid Credentials')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
