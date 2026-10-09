import { useState } from 'react'

const PUFF_DELAYS = [0.1, 0.25, 0.4]
const SPARKLES = [
  { left: '14%', top: '16%', delay: 0.8 },
  { left: '72%', top: '62%', delay: 1.1 },
]
// Fixed rather than random, so every replay looks the same.
const DROPS = [
  { left: '30%', delay: 0 },
  { left: '46%', delay: 0.35 },
  { left: '60%', delay: 0.15 },
  { left: '72%', delay: 0.5 },
]

/**
 * A small animated tile for the latest day's move: a rocket launching on an
 * up day, a rain cloud on a down day. It stays inside its own tile so it never
 * covers the numbers. Click to play it again; reduced-motion users see the
 * still end state.
 */
export function DayMood({ mood }: { mood: 'up' | 'down' }) {
  const [plays, setPlays] = useState(0)
  return (
    // A new key remounts the tile, which restarts its CSS animations.
    <button
      key={`${mood}-${plays}`}
      className={`mood-tile ${mood === 'up' ? 'bg-delta-up/10' : 'bg-series-you/10'}`}
      onClick={() => setPlays((n) => n + 1)}
      aria-label={mood === 'up' ? 'Up day. Play the animation again' : 'Down day. Play the animation again'}
      title="Play again"
    >
      {mood === 'up' ? (
        <>
          {PUFF_DELAYS.map((delay) => (
            <span key={delay} className="mood-puff" style={{ animationDelay: `${delay}s` }} aria-hidden />
          ))}
          {SPARKLES.map((s) => (
            <span
              key={s.left}
              className="mood-sparkle"
              style={{ left: s.left, top: s.top, animationDelay: `${s.delay}s` }}
              aria-hidden
            >
              ✨
            </span>
          ))}
          <span className="mood-rocket" aria-hidden>
            🚀
          </span>
        </>
      ) : (
        <>
          {DROPS.map((d) => (
            <span
              key={d.left}
              className="mood-drop"
              style={{ left: d.left, animationDelay: `${d.delay}s` }}
              aria-hidden
            />
          ))}
          <span className="mood-cloud" aria-hidden>
            ☁️
          </span>
        </>
      )}
    </button>
  )
}
