/**
 * Checks Team Dream's files before a meeting's results are committed:
 * the ledger's orders, the reports, the lessons and the weekly look-backs. Prints every problem and
 * exits 1 if there is one, so a bad meeting never reaches the website.
 *
 *   node scripts/dream-check.ts
 */
import { existsSync, readFileSync } from 'node:fs'

import type { DreamLedger } from '../src/lib/dream.ts'
import {
  DREAM_AGENTS,
  DREAM_THEMES,
  LYNCH_CATEGORIES,
  type DreamLesson,
  type DreamReport,
  type DreamRetro,
} from '../src/lib/dreamTeam.ts'

const problems: string[] = []
const fail = (message: string) => problems.push(message)
const read = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (e) {
    fail(`${path}: ${(e as Error).message}`)
    return null
  }
}
const ISO = /^\d{4}-\d{2}-\d{2}$/
const TICKER = /^[A-Z][A-Z0-9.]{0,9}$/

const ledger = read<DreamLedger>('public/dream/ledger.json')
const index = read<{ reports: string[] }>('public/dream/reports/index.json')
const state = existsSync('public/dream/state.json')
  ? read<{ cashUsd: number; holdings: { ticker: string; valueUsd: number }[] }>('public/dream/state.json')
  : null

if (ledger) {
  if (ledger.orders.some((o) => o.usd != null && o.usd < 200 && o.side === 'buy'))
    fail('every buy must be at least $200')
  if (!ISO.test(ledger.startDate)) fail('ledger.startDate must be YYYY-MM-DD')
  const ids = new Set<string>()
  for (const o of ledger.orders) {
    const where = `order ${o.id ?? '(no id)'}`
    if (!o.id || ids.has(o.id)) fail(`${where}: id missing or repeated`)
    ids.add(o.id)
    if (!ISO.test(o.reportDate ?? '') || !ISO.test(o.session ?? ''))
      fail(`${where}: reportDate/session must be YYYY-MM-DD`)
    if (o.session < o.reportDate) fail(`${where}: session is before the meeting that placed it`)
    // The team may pick which session an order fills at, up to a week after the meeting.
    const latestSession = new Date(`${o.reportDate}T00:00:00Z`)
    latestSession.setUTCDate(latestSession.getUTCDate() + 7)
    if (o.session > latestSession.toISOString().slice(0, 10))
      fail(`${where}: session is more than 7 days after the meeting`)
    if (!TICKER.test(o.ticker ?? '')) fail(`${where}: ticker "${o.ticker}" looks wrong`)
    if (o.side === 'buy' && !(typeof o.usd === 'number' && o.usd >= 1)) fail(`${where}: a buy needs usd >= 1`)
    if (o.side === 'sell' && !(typeof o.fraction === 'number' && o.fraction > 0 && o.fraction <= 1))
      fail(`${where}: a sell needs 0 < fraction <= 1`)
    if (o.side !== 'buy' && o.side !== 'sell') fail(`${where}: side must be buy or sell`)
    if (!o.reason?.trim()) fail(`${where}: needs a reason`)
    if (index && !index.reports.includes(o.reportDate)) fail(`${where}: no report for ${o.reportDate}`)
  }

  // At most 6 orders a meeting (10 in the first one, which builds the portfolio).
  if (index) {
    for (const [i, date] of index.reports.entries()) {
      const count = ledger.orders.filter((o) => o.reportDate === date).length
      if (count > (i === 0 ? 10 : 6)) fail(`meeting ${date}: ${count} orders, more than the limit`)
    }
  }

  // The latest meeting's buys can't spend more than the cash plus what its sells raise.
  const latest = index?.reports.at(-1)
  if (state && latest) {
    const today = ledger.orders.filter((o) => o.reportDate === latest)
    const raised = today
      .filter((o) => o.side === 'sell')
      .reduce(
        (sum, o) => sum + (state.holdings.find((h) => h.ticker === o.ticker)?.valueUsd ?? 0) * (o.fraction ?? 0),
        0,
      )
    const spend = today.filter((o) => o.side === 'buy').reduce((sum, o) => sum + (o.usd ?? 0), 0)
    if (spend > (state.cashUsd + raised) * 0.995 + 1)
      fail(
        `buys of $${spend.toFixed(2)} are more than cash $${state.cashUsd.toFixed(2)} + sells ~$${raised.toFixed(2)}`,
      )
  }
}

if (index) {
  const sorted = [...index.reports].sort()
  if (sorted.join() !== index.reports.join() || new Set(sorted).size !== sorted.length)
    fail('reports/index.json must list each date once, oldest first')
  for (const date of index.reports) {
    const report = read<DreamReport>(`public/dream/reports/${date}.json`)
    if (!report) continue
    const where = `report ${date}`
    if (report.date !== date) fail(`${where}: date field doesn't match the file name`)
    if (!report.headline?.trim() || !report.summary?.trim()) fail(`${where}: needs headline and summary`)
    // Everyone who had joined by that meeting writes a memo.
    for (const { id } of DREAM_AGENTS.filter((a) => !a.since || date >= a.since)) {
      const memo = report.memos?.find((m) => m.agent === id)
      if (!memo) fail(`${where}: no memo from ${id}`)
      else if (!memo.title?.trim() || !memo.points?.length) fail(`${where}: ${id}'s memo needs a title and points`)
      for (const s of memo?.sources ?? [])
        if (!/^https?:\/\//.test(s.url)) fail(`${where}: ${id} source url "${s.url}"`)
    }
    // Lynch: every stock bought or held has a category and a two-minute story.
    for (const d of report.decisions ?? []) {
      if (!['buy', 'sell', 'hold', 'watch'].includes(d.action)) fail(`${where}: decision action "${d.action}"`)
      if (d.category && !(d.category in LYNCH_CATEGORIES)) fail(`${where}: ${d.ticker} category "${d.category}"`)
      if ((d.action === 'buy' || d.action === 'hold') && !d.category)
        fail(`${where}: ${d.ticker} needs a Lynch category`)
      // Only the four themes the owner follows, each explained in one plain sentence.
      if (d.theme && !(d.theme in DREAM_THEMES)) fail(`${where}: ${d.ticker} theme "${d.theme}"`)
      if ((d.action === 'buy' || d.action === 'hold') && !d.theme) fail(`${where}: ${d.ticker} needs a theme`)
      if ((d.action === 'buy' || d.action === 'hold') && d.theme !== 'cash' && !d.about?.trim())
        fail(`${where}: ${d.ticker} needs "about", what the company does`)
      if (
        (d.action === 'buy' || d.action === 'hold') &&
        d.category !== 'cash' &&
        !(d.story?.trim() && d.sellIf?.trim())
      )
        fail(`${where}: ${d.ticker} needs its two-minute story and sellIf`)
      if (d.orderId && ledger && !ledger.orders.some((o) => o.id === d.orderId))
        fail(`${where}: decision points to order ${d.orderId}, not in the ledger`)
    }
  }
}

// The knowledge base: lessons only become binding rules with a second, separate case behind them.
const lessons = existsSync('public/dream/lessons.json')
  ? (read<{ lessons: DreamLesson[] }>('public/dream/lessons.json')?.lessons ?? [])
  : []
const lessonIds = new Set<string>()
for (const l of lessons) {
  const where = `lesson ${l.id}`
  if (!/^L\d{3}$/.test(l.id) || lessonIds.has(l.id)) fail(`${where}: id must be L001-style and unique`)
  lessonIds.add(l.id)
  if (!['candidate', 'rule', 'retired'].includes(l.status)) fail(`${where}: status "${l.status}"`)
  if (!l.title?.trim() || !l.detail?.trim()) fail(`${where}: needs a title and detail`)
  if (!l.appliesTo?.length || l.appliesTo.some((a) => !DREAM_AGENTS.some((g) => g.id === a)))
    fail(`${where}: appliesTo must name team members`)
  if (!l.evidence?.length || l.evidence[0].kind !== 'origin') fail(`${where}: evidence must start with its origin`)
  const confirmed = l.evidence?.filter((e) => e.kind === 'confirmed').length ?? 0
  if (l.status === 'rule' && confirmed < 1)
    fail(`${where}: a rule needs at least one confirming case besides its origin`)
}
if (index) {
  for (const date of index.reports) {
    const report = read<DreamReport>(`public/dream/reports/${date}.json`)
    for (const d of report?.decisions ?? [])
      for (const id of d.lessons ?? [])
        if (!lessons.some((l) => l.id === id && l.status !== 'retired'))
          fail(`report ${date}: ${d.ticker} applies lesson ${id}, which isn't an active lesson`)
  }
}
const retros = existsSync('public/dream/retros/index.json')
  ? read<{ retros: string[] }>('public/dream/retros/index.json')
  : { retros: [] }
for (const date of retros?.retros ?? []) {
  const retro = read<DreamRetro>(`public/dream/retros/${date}.json`)
  if (!retro) continue
  const where = `retro ${date}`
  if (retro.date !== date) fail(`${where}: date field doesn't match the file name`)
  if (!retro.headline?.trim() || !retro.summary?.trim()) fail(`${where}: needs headline and summary`)
  if (typeof retro.score?.dreamPct !== 'number' || typeof retro.score?.spyPct !== 'number')
    fail(`${where}: needs score`)
  for (const r of retro.reviews ?? [])
    if (!['right', 'wrong', 'lucky', 'unlucky', 'too-early'].includes(r.verdict))
      fail(`${where}: ${r.ticker} verdict "${r.verdict}"`)
  if ((retro.lessonChanges ?? []).filter((c) => c.change === 'added').length > 2)
    fail(`${where}: at most 2 new lessons a week`)
  for (const c of retro.lessonChanges ?? [])
    if (!lessonIds.has(c.id)) fail(`${where}: lesson ${c.id} isn't in lessons.json`)
}

if (problems.length) {
  console.error(`Dream check: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}
console.log('Dream check: ok')
