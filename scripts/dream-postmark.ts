/**
 * Stamps every Team Lynch order with when it was committed, from the git
 * history of public/dream/ledger.json, and writes public/dream/postmarks.json.
 *
 * The engine (src/lib/dream.ts) uses the stamp to make sure no order trades
 * at a close the meeting could already have seen: an order committed after
 * its session opened moves to the next session. The check script fails when
 * an order was changed after it first appeared (orders are final once placed).
 *
 * Uses each commit's author time, which a rebase keeps. Needs the full
 * history (the GitHub Action checks out with fetch-depth: 0).
 *
 *   node scripts/dream-postmark.ts
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { orderKey, type DreamOrder, type Postmark, type Postmarks } from '../src/lib/dream.ts'

const LEDGER = 'public/dream/ledger.json'
const OUT = 'public/dream/postmarks.json'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
  console.error('Shallow clone: fetch the full history first (git fetch --unshallow).')
  process.exit(1)
}

const commits = git('log', '--reverse', '--format=%H %aI', '--', LEDGER)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [sha, at] = line.split(' ')
    return { sha, at: new Date(at).toISOString() }
  })

const seen = new Map<string, { key: string; at: string; firstAt: string; edits: number }>()
const removed: { id: string; at: string }[] = []
let previous = new Set<string>()
let current: DreamOrder[] = []
for (const { sha, at } of commits) {
  let orders: DreamOrder[]
  try {
    orders = (JSON.parse(git('show', `${sha}:${LEDGER}`)) as { orders: DreamOrder[] }).orders ?? []
  } catch {
    continue // a commit with a broken ledger: the next one fixes it
  }
  for (const o of orders) {
    const key = orderKey(o)
    const prev = seen.get(o.id)
    if (!prev) seen.set(o.id, { key, at, firstAt: at, edits: 0 })
    else if (prev.key !== key) seen.set(o.id, { key, at, firstAt: prev.firstAt, edits: prev.edits + 1 })
  }
  const ids = new Set(orders.map((o) => o.id))
  for (const id of previous) if (!ids.has(id)) removed.push({ id, at })
  previous = ids
  current = orders
}

// Stamps for the orders in the ledger now; removed ones are listed so the check can flag them.
const orders: Record<string, Postmark> = {}
for (const o of [...current].sort((a, b) => a.id.localeCompare(b.id))) {
  const { at, firstAt, edits } = seen.get(o.id)!
  orders[o.id] = edits ? { at, firstAt, edits } : { at }
}
const file: Postmarks = { orders, removed }
writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n')
console.log(
  `Postmarked ${Object.keys(orders).length} orders from ${commits.length} commits (${removed.length} removed)`,
)
