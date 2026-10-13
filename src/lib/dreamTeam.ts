/** Team Dream's members and the shape of a meeting report (public/dream/reports/<date>.json). */

export type DreamAgentId = 'atlas' | 'lens' | 'tempo' | 'guard' | 'captain'

export type DreamAgent = {
  id: DreamAgentId
  name: string
  /** The name in Thai script. */
  thaiName: string
  role: string
  /** What they look at, one line. */
  focus: string
}

export const DREAM_AGENTS: DreamAgent[] = [
  {
    id: 'atlas',
    name: 'Atlas',
    thaiName: 'แอตลาส',
    role: 'นักเศรษฐศาสตร์',
    focus: 'ดอกเบี้ย เฟด เงินเฟ้อ การจ้างงาน และกลุ่มอุตสาหกรรมที่ตลาดชอบ ตัดสินว่าควรเสี่ยงมากหรือน้อย',
  },
  {
    id: 'lens',
    name: 'Lens',
    thaiName: 'เลนส์',
    role: 'นักวิเคราะห์ปัจจัยพื้นฐาน',
    focus: 'งบการเงิน การประชุมนักวิเคราะห์ (earnings call) แนวโน้มรายได้ กำไร และราคาเทียบมูลค่า',
  },
  {
    id: 'tempo',
    name: 'Tempo',
    thaiName: 'เทมโป',
    role: 'นักจับจังหวะและกระแสข่าว',
    focus: 'แนวโน้มราคา ความแข็งแรงเทียบ S&P 500 ข่าว และเหตุการณ์ที่กำลังจะมา เช่น วันประกาศงบ',
  },
  {
    id: 'guard',
    name: 'Guard',
    thaiName: 'การ์ด',
    role: 'ผู้ดูแลความเสี่ยง',
    focus: 'ขนาดแต่ละตัว การกระจุกตัว เงินสด และวินัยตัดขาดทุน มีสิทธิ์ยับยั้งหรือลดขนาดคำสั่ง',
  },
  {
    id: 'captain',
    name: 'Captain',
    thaiName: 'กัปตัน',
    role: 'ผู้จัดการพอร์ต',
    focus: 'ฟังทุกคนแล้วตัดสินใจ ซื้อ ขาย หรือถือ และเขียนสรุปการประชุม',
  },
]

export type DreamMemo = {
  agent: DreamAgentId
  title: string
  /** Atlas: risk-on / neutral / risk-off; others may give a one-word view too. */
  stance?: string
  points: string[]
  sources?: { title: string; url: string }[]
}

export type DreamDecision = {
  ticker: string
  action: 'buy' | 'sell' | 'hold' | 'watch'
  /** The order in ledger.json, for buys and sells. */
  orderId?: string
  why: string
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
