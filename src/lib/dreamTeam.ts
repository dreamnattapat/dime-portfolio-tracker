/**
 * Team Lynch's members (Peter Lynch style) and the shape of a meeting report
 * (public/dream/reports/<date>.json).
 */

export type DreamAgentId = 'atlas' | 'scout' | 'lens' | 'tempo' | 'story' | 'guard' | 'captain'

export type DreamAgent = {
  id: DreamAgentId
  name: string
  /** The name in Thai script. */
  thaiName: string
  role: string
  /** What they look at, one line. */
  focus: string
  /** The first meeting (YYYY-MM-DD) they take part in, if they joined after the first one. */
  since?: string
}

export const DREAM_AGENTS: DreamAgent[] = [
  {
    id: 'atlas',
    name: 'Atlas',
    thaiName: 'แอตลาส',
    role: 'นักเศรษฐศาสตร์',
    focus:
      'ดอกเบี้ย เฟด เงินเฟ้อ การจ้างงาน และวัฏจักรเศรษฐกิจ บอกสภาพอากาศของตลาดและเงินสดที่ควรถือ ไม่ใช้ทายขึ้นลงของตลาด',
    since: '2026-10-19',
  },
  {
    id: 'scout',
    name: 'Scout',
    thaiName: 'สเกาต์',
    role: 'นักล่าไอเดีย',
    focus: 'หาบริษัทที่ลูกค้าจริงกำลังแห่ใช้ ก่อนที่วอลล์สตรีทจะสังเกตเห็น ตามหลัก "ลงทุนในสิ่งที่รู้จัก" ของ Lynch',
  },
  {
    id: 'lens',
    name: 'Lens',
    thaiName: 'เลนส์',
    role: 'นักวิเคราะห์ปัจจัยพื้นฐาน',
    focus: 'ทำการบ้านแบบ Lynch: PEG การเติบโตของกำไร หนี้ เงินสด สินค้าคงคลัง และจัดหุ้นเข้า 6 ประเภท',
  },
  {
    id: 'tempo',
    name: 'Tempo',
    thaiName: 'เทมโป',
    role: 'นักวิเคราะห์เทคนิค',
    focus:
      'เทรนด์ราคา ความแข็งแรงเทียบ S&P 500 แนวรับ/แนวต้าน วอลุ่ม และวันประกาศงบ แนะนำว่าจะให้คำสั่งเติมวันไหน ไม่ใช้เป็นเหตุผลเดียวในการซื้อขาย',
    since: '2026-10-19',
  },
  {
    id: 'story',
    name: 'Story',
    thaiName: 'สตอรี่',
    role: 'นักเล่าเรื่องและผู้ค้าน',
    focus: 'เขียน "เรื่องเล่า 2 นาที" ของแต่ละตัว ตรวจว่าเรื่องยังจริงอยู่ไหม และค้านทุกการซื้อที่ฟังดูดีเกินจริง',
  },
  {
    id: 'guard',
    name: 'Guard',
    thaiName: 'การ์ด',
    role: 'ผู้ดูแลความเสี่ยง',
    focus: 'ขนาดแต่ละตัว การกระจุกตัว สัดส่วนหุ้นแต่ละประเภท และเหตุการณ์เสี่ยง มีสิทธิ์ยับยั้งหรือลดขนาดคำสั่ง',
  },
  {
    id: 'captain',
    name: 'Captain',
    thaiName: 'กัปตัน',
    role: 'ผู้จัดการพอร์ต',
    focus: 'ตัดสินใจซื้อ ขาย หรือถือ "รดน้ำดอกไม้ ถอนวัชพืช" และเขียนสรุปการประชุม',
  },
]

/** Peter Lynch's six kinds of stock, plus cash parking. */
export type LynchCategory =
  'fast-grower' | 'stalwart' | 'slow-grower' | 'cyclical' | 'turnaround' | 'asset-play' | 'cash'

export const LYNCH_CATEGORIES: Record<LynchCategory, string> = {
  'fast-grower': 'โตเร็ว',
  stalwart: 'แกร่ง',
  'slow-grower': 'โตช้า',
  cyclical: 'วัฏจักร',
  turnaround: 'พลิกฟื้น',
  'asset-play': 'สินทรัพย์ซ่อนค่า',
  cash: 'พักเงิน',
}

/** The four themes the owner follows (the team only buys within them), plus cash parking. */
export type DreamTheme = 'tech' | 'space' | 'health' | 'energy' | 'cash'

export const DREAM_THEMES: Record<DreamTheme, string> = {
  tech: 'เทคโนโลยี',
  space: 'อวกาศ',
  health: 'สุขภาพ',
  energy: 'พลังงาน',
  cash: 'พักเงิน',
}

export type DreamMemo = {
  agent: DreamAgentId
  title: string
  /** An optional one-word view. */
  stance?: string
  /** Set when the memo was written after the meeting, by someone who wasn't in the room. */
  late?: string
  points: string[]
  sources?: { title: string; url: string }[]
}

export type DreamDecision = {
  ticker: string
  action: 'buy' | 'sell' | 'hold' | 'watch'
  /** The order in ledger.json, for buys and sells. */
  orderId?: string
  /** Lynch's category, for anything bought or held. */
  category?: LynchCategory
  /** Which of the four themes it belongs to. */
  theme?: DreamTheme
  /** What the company does, in one plain sentence. */
  about?: string
  why: string
  /** The two-minute story, for buys and holds. */
  story?: string
  /** What would make the team sell. */
  sellIf?: string
  /** The last close the team saw at the meeting. */
  priceUsd?: number
  /** Where the team thinks it can go in about 12 months, and what that rests on. */
  targetUsd?: number
  targetWhy?: string
  /** The price where the trend or the story is broken, so the team gets out, and why that level. */
  stopUsd?: number
  stopWhy?: string
  /** Required when reward:risk is below 1:2: the team's verdict (keep, trim or sell) and why. */
  review?: string
  /** Lessons (lessons.json ids) this decision applied. */
  lessons?: string[]
}

export type DreamReport = {
  /** Meeting date in Bangkok, YYYY-MM-DD; also the file name. */
  date: string
  /** The US session the orders fill at. */
  session: string
  headline: string
  /** Captain's summary of the meeting. */
  summary: string
  memos: DreamMemo[]
  decisions: DreamDecision[]
  /** What the team will watch before the next meeting. */
  nextWatch?: string[]
}

/**
 * What the team has learned from its own results (public/dream/lessons.json).
 * Plain words, not tied to any AI model: whoever runs the next meeting reads
 * and applies them. A lesson starts as a candidate, becomes a binding rule once
 * a second, separate case confirms it, and is retired if it proves wrong.
 */
export type DreamLesson = {
  /** L001, L002, ... */
  id: string
  status: 'candidate' | 'rule' | 'retired'
  /** The lesson as a short check to apply, in Thai. */
  title: string
  /** Why, and how to apply it, in Thai. */
  detail: string
  /** Who applies it most. */
  appliesTo: DreamAgentId[]
  created: string
  updated: string
  /** The cases behind it, newest last. */
  evidence: { date: string; ticker?: string; note: string; kind: 'origin' | 'confirmed' | 'contradicted' }[]
}

/** A weekly look back (public/dream/retros/<date>.json). */
export type DreamRetro = {
  date: string
  headline: string
  /** What went right and wrong this week, in Thai. */
  summary: string
  /** Dream vs SPY since the start and over the past week, %. */
  score: { dreamPct: number; spyPct: number; weekDreamPct?: number; weekSpyPct?: number }
  /** Past decisions judged by process and outcome. */
  reviews: {
    ticker: string
    reportDate: string
    action: string
    returnPct?: number
    vsSpyPct?: number
    /** right: good call; wrong: bad call; lucky: good result, bad reasoning; unlucky: bad result, sound reasoning; too-early: wait. */
    verdict: 'right' | 'wrong' | 'lucky' | 'unlucky' | 'too-early'
    note: string
  }[]
  /** What changed in lessons.json. */
  lessonChanges: { id: string; change: 'added' | 'confirmed' | 'contradicted' | 'promoted' | 'retired'; note: string }[]
}

/** A concentrated portfolio: never more than this many holdings. */
export const MAX_HOLDINGS = 5

/** Reward:risk from a price, a target and a stop, as reward per 1 of risk. Null when it can't be worked out. */
export function rewardRisk(price: number, target: number, stop: number): number | null {
  const risk = price - stop
  if (![price, target, stop].every(Number.isFinite) || risk <= 0) return null
  return (target - price) / risk
}

/** The owner's bands: 1:3 and up is very good, 1:2 is fine, near 1:1 means review. */
export const RR_VERY_GOOD = 3
export const RR_OK = 2
export const RR_REVIEW = 1.2

export type RewardRiskVerdict = { label: string; tone: 'great' | 'ok' | 'weak' | 'review' }

export function rewardRiskVerdict(exact: number | null): RewardRiskVerdict {
  // Judged at one decimal, as written (1:2.0), so 1.98 counts as 1:2.
  const ratio = exact == null ? null : Math.round(exact * 10) / 10
  if (ratio == null || ratio < RR_REVIEW) return { label: 'ต้องทบทวน', tone: 'review' }
  if (ratio >= RR_VERY_GOOD) return { label: 'ดีมาก', tone: 'great' }
  if (ratio >= RR_OK) return { label: 'โอเค', tone: 'ok' }
  return { label: 'อ่อน', tone: 'weak' }
}
