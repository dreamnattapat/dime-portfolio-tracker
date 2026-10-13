import { ArrowLeft, Check, ChevronDown, ExternalLink, Trophy, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AgentAvatar } from '@/components/dream/AgentAvatar'
import { DreamChart } from '@/components/dream/DreamChart'
import { TradeBadge } from '@/components/TradeBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchDreamJson, useDream, type DreamData } from '@/hooks/useDream'
import type { DreamFill } from '@/lib/dream'
import { DREAM_AGENTS, LYNCH_CATEGORIES, type DreamReport, type LynchCategory } from '@/lib/dreamTeam'
import { formatDate, formatMoney, formatNumber, formatPercent, formatSignedMoney } from '@/lib/format'

/** Team Dream's public page: the team, the score against the S&P 500, and every meeting. */
export function DreamPage() {
  const { data, error } = useDream()
  const [latest, setLatest] = useState<DreamReport | null>(null)
  const latestDate = data?.reports.at(-1)

  useEffect(() => {
    if (latestDate) fetchDreamJson<DreamReport>(`/dream/reports/${latestDate}.json`).then(setLatest, () => {})
  }, [latestDate])

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 pt-8 pb-12 sm:pt-12">
      <a href="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden />
        ส่องพอร์ต Dime
      </a>
      <header className="space-y-2">
        <p className="text-brand text-sm font-semibold">ความท้าทาย · สไตล์ Peter Lynch</p>
        <h1 className="font-display text-3xl font-medium sm:text-4xl">ทีม Dream</h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          ทีม AI 5 ตัว ลงทุนตามหลักของ Peter Lynch ด้วยเงินสมมติ $
          {formatNumber(data?.ledger.startingCashUsd ?? 10_000, 0)} เป้าหมายเดียว: ชนะ S&P 500
          ตามล่าหุ้นที่โตได้หลายเท่า (multi-bagger) ประชุมทุกวันจันทร์ก่อนตลาดสหรัฐฯ เปิด และซื้อขายที่ราคาปิดของคืนนั้น
        </p>
      </header>

      {error && <p className="text-muted-foreground text-sm">โหลดข้อมูลทีม Dream ไม่ได้ ({error})</p>}
      {data ? <Scoreboard data={data} /> : !error && <p className="text-muted-foreground text-sm">กำลังโหลด…</p>}

      <Team latest={latest} />

      {data && (
        <LatestMeeting
          report={latest}
          fills={data.state.fills.filter((f) => f.reportDate === latestDate)}
          empty={!latestDate}
        />
      )}
      {data && <Holdings data={data} report={latest} />}
      {data && data.reports.length > 1 && <PastMeetings dates={data.reports.slice(0, -1).toReversed()} data={data} />}
      {data && data.state.fills.length > 0 && <TradeLog fills={data.state.fills} />}
      <Rules />
    </main>
  )
}

function Scoreboard({ data }: { data: DreamData }) {
  const { state, ledger } = data
  const lead = state.returnPct - state.spyReturnPct
  const started = state.points.length > 2
  const ahead = lead > 0.005
  const even = Math.abs(lead) <= 0.005
  const sessions = state.points.length - 2 // less the starting point and today's
  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">มูลค่าพอร์ต Dream</p>
            <p className="font-display text-4xl font-medium tabular-nums">{formatMoney(state.valueUsd, '$')}</p>
            <p className="text-muted-foreground text-xs">
              เริ่ม {formatDate(ledger.startDate)} · เงินสด {formatMoney(state.cashUsd, '$')}
              {started && ` · ผ่านไป ${Math.max(sessions, 1)} วันทำการ`}
            </p>
          </div>
          <div
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
              !started || even
                ? 'bg-muted'
                : ahead
                  ? 'bg-delta-up/10 text-delta-up'
                  : 'bg-delta-down/10 text-delta-down'
            }`}
          >
            {started &&
              !even &&
              (ahead ? <Trophy className="size-6" aria-hidden /> : <X className="size-6" aria-hidden />)}
            <div>
              <p className="font-semibold">
                {!started ? 'รอซื้อขายครั้งแรก' : even ? 'สูสีกับ S&P 500' : ahead ? 'นำ S&P 500' : 'ตาม S&P 500'}
              </p>
              {started && !even && (
                <p className="text-sm tabular-nums">{formatPercent(Math.abs(lead), { decimals: 2 })}</p>
              )}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-md">
          <div>
            <dt className="text-muted-foreground">ทีม Dream</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatPercent(state.returnPct, { signed: true, decimals: 2 })}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">S&P 500 (SPY)</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatPercent(state.spyReturnPct, { signed: true, decimals: 2 })}
            </dd>
          </div>
        </dl>
        {state.points.length > 2 && <DreamChart points={state.points} startingCash={ledger.startingCashUsd} />}
      </CardContent>
    </Card>
  )
}

function Team({ latest }: { latest: DreamReport | null }) {
  return (
    <section aria-labelledby="team" className="space-y-3">
      <h2 id="team" className="font-display text-xl font-medium">
        สมาชิกทีม
      </h2>
      {/* A swipeable row on a phone, a grid on a wide screen. */}
      <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {DREAM_AGENTS.map((agent) => {
          const stance = latest?.memos.find((m) => m.agent === agent.id)?.stance
          return (
            <Card key={agent.id} className="w-64 shrink-0 snap-start gap-3 py-5 lg:w-auto">
              <CardContent className="space-y-3 px-5">
                <div className="flex items-center gap-3">
                  <AgentAvatar agent={agent.id} />
                  <div>
                    <p className="font-semibold">{agent.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {agent.thaiName} · {agent.role}
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">{agent.focus}</p>
                {stance && (
                  <p className="text-xs">
                    มุมมองล่าสุด: <span className="font-semibold">{stance}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

function LatestMeeting({ report, fills, empty }: { report: DreamReport | null; fills: DreamFill[]; empty: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ประชุมล่าสุด</CardTitle>
        <CardDescription>
          {empty
            ? 'ทีมยังไม่ได้ประชุมครั้งแรก'
            : report
              ? `${formatDate(report.date)} · ซื้อขายที่ราคาปิดของรอบ ${formatDate(report.session)}`
              : 'กำลังโหลด…'}
        </CardDescription>
      </CardHeader>
      {report && (
        <CardContent>
          <Report report={report} fills={fills} />
        </CardContent>
      )}
    </Card>
  )
}

/** One meeting: Captain's summary, the decisions and every agent's memo. */
function Report({ report, fills }: { report: DreamReport; fills: DreamFill[] }) {
  const byId = new Map(fills.map((f) => [f.id, f]))
  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <AgentAvatar agent="captain" />
        <div className="space-y-1">
          <p className="font-display text-lg leading-snug font-medium">{report.headline}</p>
          <p className="text-muted-foreground text-sm leading-relaxed">{report.summary}</p>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">การตัดสินใจ</h3>
        <ul className="divide-y rounded-2xl border">
          {report.decisions.map((d, i) => {
            const fill = d.orderId ? byId.get(d.orderId) : undefined
            return (
              <li key={`${d.ticker}-${i}`} className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <span className="w-16 shrink-0 font-semibold">{d.ticker}</span>
                  <DecisionBadge action={d.action} />
                  {d.category && <CategoryChip category={d.category} />}
                  <span className="text-muted-foreground min-w-0 flex-1 basis-60 leading-relaxed">{d.why}</span>
                  {fill && <FillStatus fill={fill} />}
                </div>
                {d.story && (
                  <details className="group/story">
                    <summary className="text-brand cursor-pointer list-none text-xs font-medium [&::-webkit-details-marker]:hidden">
                      เรื่องเล่า 2 นาที
                      <ChevronDown
                        className="ml-0.5 inline size-3 transition-transform group-open/story:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="bg-muted/60 mt-2 space-y-2 rounded-xl px-3 py-2 text-xs leading-relaxed">
                      <p>{d.story}</p>
                      {d.sellIf && (
                        <p>
                          <span className="font-semibold">ขายเมื่อ: </span>
                          {d.sellIf}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">บันทึกของแต่ละคน</h3>
        {DREAM_AGENTS.map((agent) => {
          const memo = report.memos.find((m) => m.agent === agent.id)
          if (!memo) return null
          return (
            <details key={agent.id} className="group rounded-2xl border px-4 py-3" open={agent.id === 'story'}>
              <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <AgentAvatar agent={agent.id} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {agent.name}
                    {memo.stance && <span className="text-muted-foreground font-normal"> · {memo.stance}</span>}
                  </span>
                  <span className="text-muted-foreground block text-xs">{memo.title}</span>
                </span>
                <ChevronDown
                  className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {memo.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              {memo.sources && memo.sources.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                  {memo.sources.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:bg-accent inline-flex items-center gap-1 rounded-full border px-2.5 py-1"
                      >
                        {s.title}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )
        })}
      </div>

      {report.nextWatch && report.nextWatch.length > 0 && (
        <div className="bg-muted/60 space-y-1 rounded-2xl px-4 py-3 text-sm">
          <h3 className="font-semibold">จับตาก่อนประชุมครั้งหน้า</h3>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            {report.nextWatch.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const ACTIONS = {
  buy: { label: 'ซื้อ', className: 'bg-delta-up/10 text-delta-up' },
  sell: { label: 'ขาย', className: 'bg-delta-down/10 text-delta-down' },
  hold: { label: 'ถือ', className: 'bg-muted text-foreground' },
  watch: { label: 'จับตา', className: 'bg-muted text-muted-foreground' },
} as const

function CategoryChip({ category }: { category: LynchCategory }) {
  return (
    <span className="border-border text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs">
      {LYNCH_CATEGORIES[category] ?? category}
    </span>
  )
}

function DecisionBadge({ action }: { action: keyof typeof ACTIONS }) {
  const { label, className } = ACTIONS[action] ?? ACTIONS.watch
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}

function FillStatus({ fill }: { fill: DreamFill }) {
  if (fill.status === 'pending')
    return (
      <span className="text-muted-foreground w-full text-xs sm:w-auto">รอราคาปิดของรอบ {formatDate(fill.session)}</span>
    )
  if (fill.status === 'rejected')
    return <span className="text-delta-down w-full text-xs sm:w-auto">ไม่สำเร็จ: {fill.note}</span>
  return (
    <span className="text-muted-foreground inline-flex w-full items-center gap-1 text-xs tabular-nums sm:w-auto">
      <Check className="text-delta-up size-3.5" aria-hidden />
      {fill.side === 'buy' ? 'ซื้อ' : 'ขาย'} {formatNumber(fill.units, 4)} หุ้น @ ${formatNumber(fill.price)}
      {fill.note ? ` (${fill.note})` : ''}
    </span>
  )
}

function Holdings({ data, report }: { data: DreamData; report: DreamReport | null }) {
  const { state } = data
  // Each holding's Lynch category, from the latest meeting.
  const category = new Map(report?.decisions.filter((d) => d.category).map((d) => [d.ticker, d.category!]))
  return (
    <Card>
      <CardHeader>
        <CardTitle>พอร์ตตอนนี้</CardTitle>
        <CardDescription>ราคาล่าสุด ต้นทุนเฉลี่ยไม่รวมค่าคอมมิชชัน</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>หุ้น</TableHead>
              <TableHead className="text-right">สัดส่วน</TableHead>
              <TableHead className="text-right">จำนวนหุ้น</TableHead>
              <TableHead className="text-right">ต้นทุนเฉลี่ย</TableHead>
              <TableHead className="text-right">ราคา</TableHead>
              <TableHead className="text-right">มูลค่า</TableHead>
              <TableHead className="text-right">กำไร/ขาดทุน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.holdings.map((h) => (
              <TableRow key={h.ticker}>
                <TableCell>
                  <span className="font-medium">{h.ticker}</span>
                  {category.get(h.ticker) && (
                    <span className="text-muted-foreground block text-xs">
                      {LYNCH_CATEGORIES[category.get(h.ticker)!]}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(h.weightPct)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(h.units, 4)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(h.avgCostUsd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(h.priceUsd)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(h.valueUsd, '$')}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${h.unrealizedUsd > 0 ? 'text-delta-up' : h.unrealizedUsd < 0 ? 'text-delta-down' : ''}`}
                >
                  {formatSignedMoney(h.unrealizedUsd, '$')}
                  <div className="text-xs opacity-80">
                    {formatPercent(h.unrealizedPct, { signed: true, decimals: 2 })}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">เงินสด</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent((state.cashUsd / state.valueUsd) * 100)}
              </TableCell>
              <TableCell colSpan={3} />
              <TableCell className="text-right tabular-nums">{formatMoney(state.cashUsd, '$')}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>รวม</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(state.valueUsd, '$')}</TableCell>
              <TableCell
                className={`text-right tabular-nums ${state.returnPct > 0 ? 'text-delta-up' : state.returnPct < 0 ? 'text-delta-down' : ''}`}
              >
                {formatSignedMoney(state.valueUsd - data.ledger.startingCashUsd, '$')}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  )
}

function PastMeetings({ dates, data }: { dates: string[]; data: DreamData }) {
  const [open, setOpen] = useState<string | null>(null)
  const [reports, setReports] = useState<Record<string, DreamReport>>({})
  function toggle(date: string) {
    setOpen(open === date ? null : date)
    if (!reports[date])
      fetchDreamJson<DreamReport>(`/dream/reports/${date}.json`).then(
        (r) => setReports((all) => ({ ...all, [date]: r })),
        () => {},
      )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>ประชุมครั้งก่อน ๆ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {dates.map((date) => (
          <div key={date} className="rounded-2xl border">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
              onClick={() => toggle(date)}
              aria-expanded={open === date}
            >
              <span className="font-medium">{formatDate(date)}</span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate">{reports[date]?.headline ?? ''}</span>
              <ChevronDown
                className={`text-muted-foreground size-4 shrink-0 transition-transform ${open === date ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {open === date && (
              <div className="border-t px-4 py-4">
                {reports[date] ? (
                  <Report report={reports[date]} fills={data.state.fills.filter((f) => f.reportDate === date)} />
                ) : (
                  <p className="text-muted-foreground text-sm">กำลังโหลด…</p>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function TradeLog({ fills }: { fills: DreamFill[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>รายการซื้อขายทั้งหมด</CardTitle>
        <CardDescription>ราคาปิดของรอบที่ซื้อขาย รวมค่าคอมมิชชัน 0.15% + VAT</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รอบ</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>หุ้น</TableHead>
              <TableHead className="text-right">จำนวนหุ้น</TableHead>
              <TableHead className="text-right">ราคา</TableHead>
              <TableHead className="text-right">เงินเข้า/ออก</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fills.toReversed().map((f) => (
              <TableRow key={f.id}>
                <TableCell>{formatDate(f.fillDate ?? f.session)}</TableCell>
                <TableCell>
                  <TradeBadge kind={f.side === 'buy' ? 'Buy' : 'Sell'} />
                </TableCell>
                <TableCell className="font-medium">{f.ticker}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {f.units != null ? formatNumber(f.units, 4) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {f.price != null ? formatNumber(f.price) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {f.cashUsd != null
                    ? formatSignedMoney(f.cashUsd, '$')
                    : f.usd
                      ? `ซื้อ ${formatMoney(f.usd, '$')}`
                      : `ขาย ${formatPercent((f.fraction ?? 0) * 100, { decimals: 0 })}`}
                </TableCell>
                <TableCell className="text-xs">
                  {f.status === 'filled' ? 'สำเร็จ' : f.status === 'pending' ? 'รอราคาปิด' : `ไม่สำเร็จ: ${f.note}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Rules() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>กติกา</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">
        <div className="space-y-1.5">
          <h3 className="font-semibold">หลักของ Peter Lynch ที่ทีมใช้</h3>
          <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
            <li>ลงทุนในสิ่งที่เข้าใจ ต้องเล่าได้ใน 2 นาทีว่าทำไมซื้อ และอะไรจะทำให้ผิด</li>
            <li>
              จัดหุ้นเป็น 6 ประเภท: โตเร็ว แกร่ง โตช้า วัฏจักร พลิกฟื้น สินทรัพย์ซ่อนค่า แต่ละแบบมีเหตุผลซื้อขายต่างกัน
            </li>
            <li>ชอบ PEG (P/E หารการเติบโตของกำไร) ราว 1 หรือต่ำกว่า หนี้น้อย และสินค้าคงคลังไม่โตเร็วกว่ายอดขาย</li>
            <li>เลี่ยงหุ้นร้อนในอุตสาหกรรมร้อน และบริษัทที่ซื้อกิจการนอกเรื่อง</li>
            <li>รดน้ำดอกไม้ ถอนวัชพืช: ถือตัวที่เรื่องเล่ายังดีไว้ ขายเมื่อเรื่องเล่าเปลี่ยน ไม่ใช่เพราะราคาแกว่ง</li>
          </ul>
        </div>
        <h3 className="font-semibold">กติกา</h3>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
          <li>เงินสมมติ ไม่ใช่เงินจริง และไม่ใช่คำแนะนำการลงทุน</li>
          <li>ประชุมก่อนตลาดสหรัฐฯ เปิด แล้วซื้อขายที่ราคาปิดของคืนนั้น จึงไม่มีทางรู้ราคาที่ซื้อขายล่วงหน้า</li>
          <li>เสียค่าคอมมิชชันแบบ Dime! (0.15% + VAT 7%) ทุกครั้งที่ซื้อขาย</li>
          <li>ซื้อหุ้นในสหรัฐฯ มูลค่าตลาด $500 ล้านขึ้นไป ไม่ยืมเงิน ไม่ short ไม่ใช้ออปชัน ใช้ ETF เฉพาะพักเงิน</li>
          <li>หุ้นตัวเดียวไม่เกิน 20% กลุ่มเดียวไม่เกิน 40% หุ้นโตเร็วรวมไม่เกิน 70% ของเงินที่ลงในหุ้น</li>
          <li>
            ไม่เกิน 6 คำสั่งต่อการประชุม (ครั้งแรก 10) และไม่ขายหุ้นที่เพิ่งซื้อไม่ถึง 4 สัปดาห์
            เว้นแต่เรื่องเล่าเปลี่ยน
          </li>
          <li>เทียบกับการซื้อ SPY ด้วยเงินเท่ากันที่ราคาปิดวันแรกแล้วถือไว้ ไม่รวมเงินปันผลทั้งสองฝั่ง</li>
          <li>ทุกตัวเลขในบันทึกต้องมีแหล่งที่มา หาได้จากลิงก์ใต้บันทึกของแต่ละคน</li>
        </ul>
      </CardContent>
    </Card>
  )
}
