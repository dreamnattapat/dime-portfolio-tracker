/**
 * Price proxy: GET /api/chart/<SYMBOL>?period1=..&period2=..&interval=1d&events=split
 * forwards to Yahoo Finance's chart endpoint (no API key), which browsers
 * can't call directly. Everything else is the static site in dist/.
 *
 * Only a ticker symbol and a date range ever reach this Worker. It passes
 * through just those parameters and logs nothing. Vite's dev server does the
 * same forwarding locally (vite.config.ts).
 */

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const SYMBOL_RE = /^[A-Z0-9.=^-]{1,15}$/
const ALLOWED_PARAMS = ['period1', 'period2', 'interval', 'events']
// Prices move during US market hours; 15 minutes is fresh enough for a dashboard.
const CACHE_SECONDS = 900

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const symbol = decodeURIComponent(url.pathname.replace(/^\/api\/chart\//, ''))
    if (request.method !== 'GET' || !url.pathname.startsWith('/api/chart/') || !SYMBOL_RE.test(symbol)) {
      return new Response('Not found', { status: 404 })
    }

    const upstream = new URL(YAHOO_CHART + encodeURIComponent(symbol))
    for (const name of ALLOWED_PARAMS) {
      const value = url.searchParams.get(name)
      if (value !== null) upstream.searchParams.set(name, value)
    }

    const response = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      // Cloudflare's edge cache: repeat lookups don't hit Yahoo again.
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    } as RequestInit)
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    })
  },
}
