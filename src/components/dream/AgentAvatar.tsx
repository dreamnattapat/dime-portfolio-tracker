import { Activity, Compass, Globe2, ScanSearch, ShieldCheck, type LucideIcon } from 'lucide-react'

import type { DreamAgentId } from '@/lib/dreamTeam'

/** Each agent's icon and colours (background tint, foreground). */
const AGENT_LOOK: Record<DreamAgentId, { icon: LucideIcon; bg: string; fg: string }> = {
  atlas: { icon: Globe2, bg: 'bg-[#e3eefb] dark:bg-[#1d3047]', fg: 'text-[#2a6cc0] dark:text-[#7fb2ef]' },
  lens: { icon: ScanSearch, bg: 'bg-[#e1f3ef] dark:bg-[#183a33]', fg: 'text-[#1f7a68] dark:text-[#6fcdb7]' },
  tempo: { icon: Activity, bg: 'bg-[#fdeadf] dark:bg-[#43281a]', fg: 'text-[#c4561a] dark:text-[#f0a072]' },
  guard: { icon: ShieldCheck, bg: 'bg-[#e8f3e0] dark:bg-[#26381c]', fg: 'text-[#3f7a1f] dark:text-[#9fd47b]' },
  captain: { icon: Compass, bg: 'bg-[#efe6fb] dark:bg-[#2f2445]', fg: 'text-[#7445c4] dark:text-[#bf9cf0]' },
}

export function AgentAvatar({ agent, size = 'md' }: { agent: DreamAgentId; size?: 'sm' | 'md' | 'lg' }) {
  const { icon: Icon, bg, fg } = AGENT_LOOK[agent]
  const box = size === 'lg' ? 'size-12' : size === 'md' ? 'size-10' : 'size-7'
  const glyph = size === 'lg' ? 'size-6' : size === 'md' ? 'size-5' : 'size-4'
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${box} ${bg} ${fg}`} aria-hidden>
      <Icon className={glyph} />
    </span>
  )
}
