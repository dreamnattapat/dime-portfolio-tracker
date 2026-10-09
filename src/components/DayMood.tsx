/** Where along the rocket's flight (0 = start, 1 = end) sparkles are left behind. */
const SPARKLES = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72]
const STARS = [
  { left: 14, top: 22, delay: 0.5 },
  { left: 72, top: 64, delay: 0.9 },
  { left: 40, top: 12, delay: 1.3 },
  { left: 86, top: 34, delay: 1.6 },
]
// Fixed rather than random, so every replay looks the same.
const DROPS = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 13) % 10) / 10,
  duration: 0.6 + ((i * 7) % 5) / 10,
}))

const FLIGHT_SECONDS = 1.8

/**
 * A one-off animation over the portfolio value card: a rocket on an up day,
 * rain on a down day. Purely decorative; hidden for reduced-motion users.
 * Remount it (change its `key`) to play it again.
 */
export function DayMood({ mood }: { mood: 'up' | 'down' }) {
  return (
    <div className="mood-overlay" aria-hidden>
      {mood === 'up' ? (
        <>
          {SPARKLES.map((t) => (
            <span
              key={t}
              className="mood-sparkle"
              style={{
                left: `${4 + 84 * t}%`,
                bottom: `${-10 + 110 * t}%`,
                animationDelay: `${t * FLIGHT_SECONDS}s`,
              }}
            >
              ✨
            </span>
          ))}
          {STARS.map((s) => (
            <span
              key={s.left}
              className="mood-star"
              style={{ left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s` }}
            >
              ⭐
            </span>
          ))}
          <span className="mood-rocket" style={{ animationDuration: `${FLIGHT_SECONDS}s` }}>
            🚀
          </span>
        </>
      ) : (
        <>
          {DROPS.map((d, i) => (
            <span
              key={i}
              className="mood-drop"
              style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s` }}
            />
          ))}
          <span className="mood-cloud">🌧️</span>
        </>
      )}
    </div>
  )
}
