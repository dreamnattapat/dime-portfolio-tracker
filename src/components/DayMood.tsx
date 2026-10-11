/**
 * The latest day's mood, drawn by the site's owner: a cheering bunny on an up
 * day, a bunny in the rain on a down day. It sits beside the total, never on
 * top of the numbers.
 */
export function DayMood({ mood }: { mood: 'up' | 'down' }) {
  const up = mood === 'up'
  return (
    <img
      src={up ? '/mood-up.jpg' : '/mood-down.jpg'}
      alt={up ? 'กระต่ายดีใจ พอร์ตวันนี้บวก' : 'กระต่ายเศร้าใต้ฝน พอร์ตวันนี้ลบ'}
      width={up ? 344 : 314}
      height={360}
      className="mood-pop h-28 w-[104px] shrink-0 rounded-2xl object-cover"
    />
  )
}
