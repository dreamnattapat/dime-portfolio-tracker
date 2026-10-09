import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { Pager } from '@/hooks/usePagination'

type PagerProps = Pager & {
  label: string
  previous: string
  next: string
}

/** "1–20 of 82" and previous/next buttons; nothing when everything fits on one page. */
export function Pagination({ current, pageCount, first, shown, total, setPage, label, previous, next }: PagerProps) {
  if (pageCount <= 1) return null
  return (
    <nav className="flex items-center justify-between gap-3 text-sm" aria-label={label}>
      <p className="text-muted-foreground tabular-nums">
        {first + 1}–{first + shown} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
          <ChevronLeft />
          <span className="sr-only">{previous}</span>
        </Button>
        <span className="text-muted-foreground tabular-nums">
          Page {current + 1} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={current === pageCount - 1}
          onClick={() => setPage(current + 1)}
        >
          <ChevronRight />
          <span className="sr-only">{next}</span>
        </Button>
      </div>
    </nav>
  )
}
