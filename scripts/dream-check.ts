/**
 * Checks Team Dream's files before a meeting's results are committed:
 * the ledger's orders, the reports, the lessons and the weekly look-backs. Prints every problem and
 * exits 1 if there is one, so a bad meeting never reaches the website.
 *
 *   node scripts/dream-check.ts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import {
  firstSessionAfter,
  orderKey,
  ORDERS_LOCKED_FROM,
  type DreamLedger,
  type DreamOrder,
  type Postmarks,
} from '../src/lib/dream.ts'
import {
  DREAM_AGENTS,
  DREAM_THEMES,
  INTEGRITY_FROM_MEETING,
  INTEGRITY_FROM_RETRO,
  LYNCH_CATEGORIES,
  MAX_HOLDINGS,
  NEAR_STOP_PCT,
  PRICE_CHECK_TOLERANCE_PCT,
  RR_OK,
  rewardRisk,
  stopGapPct,
  type DreamLesson,
  type DreamReport,
  type DreamRetro,
  type DreamRuleChange,
} from '../src/lib/dreamTeam.ts'

const problems: string[] = []
const warnings: string[] = []
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
type StateFile = {
  closedThrough: string
  cashUsd: number
  holdings: { ticker: string; valueUsd: number; priceUsd: number }[]
  orders?: (Partial<DreamOrder> & { id: string; status: string })[]
  priceChecks?: {
    reportDate: string
    ticker: string
    priceUsd: number
    closeDate: string
    closeUsd: number
    diffPct: number
  }[]
}
const state = existsSync('public/dream/state.json') ? read<StateFile>('public/dream/state.json') : null
const VERDICTS = ['right', 'wrong', 'lucky', 'unlucky', 'too-early']
const daysBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000

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
    // Only what hasn't filled yet: filled orders have already left state.json's cash.
    const filled = new Set((state.orders ?? []).filter((f) => f.status !== 'pending').map((f) => f.id))
    const today = ledger.orders.filter((o) => o.reportDate === latest && !filled.has(o.id))
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

// ---------- Integrity: orders are final once placed, and never placed after their session opened ----------
if (ledger) {
  // 1. Against what's already published (origin/main, or the last commit): nothing changed or removed, and new
  //    orders only for sessions that haven't opened yet.
  const published = (() => {
    for (const ref of ['origin/main', 'HEAD']) {
      try {
        const text = execFileSync('git', ['show', `${ref}:public/dream/ledger.json`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        return (JSON.parse(text) as DreamLedger).orders
      } catch {
        // not a git checkout, or no such ref: try the next
      }
    }
    return null
  })()
  if (published) {
    const now = new Map(ledger.orders.map((o) => [o.id, o]))
    for (const old of published) {
      const cur = now.get(old.id)
      if (!cur) fail(`order ${old.id} was removed: placed orders are final`)
      else if (orderKey(cur) !== orderKey(old)) fail(`order ${old.id} was changed: placed orders are final`)
    }
    const earliest = firstSessionAfter(new Date())
    for (const o of ledger.orders)
      if (!published.some((p) => p.id === o.id) && o.session < earliest)
        fail(`order ${o.id}: session ${o.session} has already opened; the earliest is ${earliest}`)
  }
  // 2. From the whole history (postmarks.json, written by the Action): changes and removals since the lock.
  const postmarks = existsSync('public/dream/postmarks.json') ? read<Postmarks>('public/dream/postmarks.json') : null
  for (const [id, pm] of Object.entries(postmarks?.orders ?? {}))
    if (pm.edits && pm.at >= ORDERS_LOCKED_FROM) fail(`order ${id} was changed on ${pm.at} after it was placed`)
  for (const r of postmarks?.removed ?? [])
    if (r.at >= ORDERS_LOCKED_FROM) fail(`order ${r.id} was removed from the ledger on ${r.at}`)
  // 3. Every order the engine has filled is still in the ledger as it was filled.
  for (const f of state?.orders ?? []) {
    if (f.status !== 'filled') continue
    const o = ledger.orders.find((x) => x.id === f.id)
    if (!o) {
      fail(`filled order ${f.id} is missing from the ledger`)
      continue
    }
    for (const k of ['ticker', 'side', 'session', 'usd', 'fraction'] as const)
      if (f[k] !== undefined && f[k] !== o[k]) fail(`filled order ${f.id}: ${k} changed after it filled`)
  }
}

// The rules can change, but only forward: each change takes effect from a later meeting.
const rules = existsSync('public/dream/rules.json')
  ? (read<{ changes: DreamRuleChange[] }>('public/dream/rules.json')?.changes ?? [])
  : []
for (const [i, r] of rules.entries()) {
  const where = `rule change ${i + 1}`
  if (!ISO.test(r.date ?? '') || !ISO.test(r.effective ?? '')) fail(`${where}: date and effective must be YYYY-MM-DD`)
  if (r.effective < r.date) fail(`${where}: takes effect before it was decided`)
  if (!r.change?.trim() || !r.why?.trim()) fail(`${where}: needs change and why`)
  if (i > 0 && r.date < rules[i - 1].date) fail(`${where}: changes must be oldest first`)
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
    if (date >= INTEGRITY_FROM_MEETING) {
      if (!report.model?.trim()) fail(`${where}: needs "model", the AI model that ran the meeting`)
      for (const d of report.decisions ?? []) {
        if (d.action !== 'buy') continue
        if ((d.bearCase ?? []).filter((p) => p.trim()).length < 2 || !d.bearAnswer?.trim())
          fail(`${where}: ${d.ticker} is a buy and needs a bearCase (2+ points) and the Captain's bearAnswer`)
      }
      // Prices of what we hold must match the last close in state.json (when it is the close before the meeting).
      if (state && state.closedThrough < date && daysBetween(state.closedThrough, date) <= 4)
        for (const d of report.decisions ?? []) {
          const h = state.holdings.find((x) => x.ticker === d.ticker)
          if (!h || d.priceUsd == null) continue
          const diff = (d.priceUsd / h.priceUsd - 1) * 100
          if (Math.abs(diff) > PRICE_CHECK_TOLERANCE_PCT)
            fail(
              `${where}: ${d.ticker} priceUsd ${d.priceUsd} is ${diff.toFixed(1)}% off the last close in state.json (${h.priceUsd})`,
            )
        }
    }
    // Every price the Action checked against the market: a fresh mismatch fails (and emails the owner); older
    // ones stay on the site with a warning and are for the retro to discuss.
    for (const c of state?.priceChecks ?? []) {
      if (c.reportDate !== date) continue
      const message = `${where}: ${c.ticker} priceUsd ${c.priceUsd} vs the real close ${c.closeUsd} on ${c.closeDate} (${c.diffPct.toFixed(1)}%)`
      const fresh = date === index.reports.at(-1) && daysBetween(date, state!.closedThrough) <= 1
      if (date >= INTEGRITY_FROM_MEETING && fresh) fail(message)
      else warnings.push(message)
    }
    // Everyone who had joined by that meeting writes a memo.
    for (const { id } of DREAM_AGENTS.filter((a) => !a.since || date >= a.since)) {
      const memo = report.memos?.find((m) => m.agent === id)
      if (!memo) fail(`${where}: no memo from ${id}`)
      else if (!memo.title?.trim() || !memo.points?.length) fail(`${where}: ${id}'s memo needs a title and points`)
      for (const s of memo?.sources ?? [])
        if (!/^https?:\/\//.test(s.url)) fail(`${where}: ${id} source url "${s.url}"`)
    }
    // Concentrated: at most 5 holdings after a meeting.
    const kept = (report.decisions ?? []).filter(
      (d) => (d.action === 'buy' || d.action === 'hold') && d.category !== 'cash',
    ).length
    if (kept > MAX_HOLDINGS) fail(`${where}: ${kept} holdings, the limit is ${MAX_HOLDINGS}`)
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
      // Reward:risk: every stock bought or held has a price, a target and a stop; buys need at least 1:2, and
      // anything under 1:2 needs the team's written review.
      if ((d.action === 'buy' || d.action === 'hold') && d.category !== 'cash') {
        const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0
        if (!num(d.priceUsd) || !num(d.targetUsd) || !num(d.stopUsd))
          fail(`${where}: ${d.ticker} needs priceUsd, targetUsd and stopUsd`)
        else {
          if (!d.targetWhy?.trim() || !d.stopWhy?.trim()) fail(`${where}: ${d.ticker} needs targetWhy and stopWhy`)
          if (d.stopUsd! >= d.priceUsd!) fail(`${where}: ${d.ticker} stop must be below the price`)
          const rr = rewardRisk(d.priceUsd!, d.targetUsd!, d.stopUsd!)
          if (d.action === 'buy' && (rr == null || Math.round(rr * 10) / 10 < RR_OK))
            fail(`${where}: ${d.ticker} is a buy at 1:${rr?.toFixed(2)}, under the 1:2 minimum`)
          if ((rr == null || Math.round(rr * 10) / 10 < RR_OK) && !d.review?.trim())
            fail(`${where}: ${d.ticker} is at 1:${rr?.toFixed(2)}, under 1:2, and needs a "review"`)
          // Just above the stop the ratio balloons (1:300) while the stock is about to break: that needs a review too.
          const gap = stopGapPct(d.priceUsd!, d.stopUsd!)
          if (date >= INTEGRITY_FROM_MEETING && gap < NEAR_STOP_PCT && !d.review?.trim())
            fail(`${where}: ${d.ticker} is ${gap.toFixed(1)}% above its stop and needs a "review"`)
        }
      }
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
  for (const r of retro.reviews ?? []) {
    if (!VERDICTS.includes(r.verdict)) fail(`${where}: ${r.ticker} verdict "${r.verdict}"`)
    if (date >= INTEGRITY_FROM_RETRO && !VERDICTS.includes(r.blindVerdict ?? ''))
      fail(`${where}: ${r.ticker} needs a blindVerdict, given before reading the team's reasoning`)
  }
  if (date >= INTEGRITY_FROM_RETRO && !retro.model?.trim()) fail(`${where}: needs "model"`)
  if ((retro.lessonChanges ?? []).filter((c) => c.change === 'added').length > 2)
    fail(`${where}: at most 2 new lessons a week`)
  for (const c of retro.lessonChanges ?? [])
    if (!lessonIds.has(c.id)) fail(`${where}: lesson ${c.id} isn't in lessons.json`)
}

if (warnings.length) {
  console.warn(`Dream check: ${warnings.length} warning(s)`)
  for (const w of warnings) console.warn(`- ${w}`)
}
if (problems.length) {
  console.error(`Dream check: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}
console.log('Dream check: ok')
