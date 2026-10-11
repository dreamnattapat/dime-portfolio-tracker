// Fixed rather than random, so every loop looks the same.
const CONFETTI = [
  { left: '12%', delay: 0, color: '#ffc53d', rotate: 20 },
  { left: '30%', delay: 0.35, color: '#ffffff', rotate: -30 },
  { left: '48%', delay: 0.15, color: '#ff7a59', rotate: 45 },
  { left: '64%', delay: 0.5, color: '#ffc53d', rotate: -15 },
  { left: '80%', delay: 0.25, color: '#ffffff', rotate: 60 },
  { left: '90%', delay: 0.6, color: '#ff7a59', rotate: -50 },
]
const RAIN = [
  { left: '10%', delay: 0 },
  { left: '26%', delay: 0.4 },
  { left: '42%', delay: 0.15 },
  { left: '58%', delay: 0.55 },
  { left: '74%', delay: 0.25 },
  { left: '90%', delay: 0.7 },
]

/**
 * The latest day's mood, drawn by the site's owner: a cheering bunny on an up
 * day, a bunny in the rain on a down day. Up days keep hopping under falling
 * confetti; down days keep swaying in the rain. Reduced-motion users see the
 * still picture. It sits beside the total, never on top of the numbers.
 */
export function DayMood({ mood }: { mood: 'up' | 'down' }) {
  const up = mood === 'up'
  return (
    <div
      role="img"
      className="mood-tile relative h-28 w-[104px] shrink-0 overflow-hidden rounded-2xl"
      aria-label={up ? 'กระต่ายดีใจ พอร์ตวันนี้บวก' : 'กระต่ายเศร้าใต้ฝน พอร์ตวันนี้ลบ'}
    >
      <img
        src={up ? '/mood-up.jpg' : '/mood-down.jpg'}
        alt=""
        width={up ? 344 : 314}
        height={360}
        className={`h-full w-full object-cover ${up ? 'mood-hop' : 'mood-sway'}`}
      />
      {up
        ? CONFETTI.map((c) => (
            <span
              key={c.left}
              className="mood-confetti"
              style={{ left: c.left, background: c.color, animationDelay: `${c.delay}s`, rotate: `${c.rotate}deg` }}
              aria-hidden
            />
          ))
        : RAIN.map((r) => (
            <span key={r.left} className="mood-rain" style={{ left: r.left, animationDelay: `${r.delay}s` }} aria-hidden />
          ))}
    </div>
  )
}
