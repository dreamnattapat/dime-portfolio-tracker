import { useState } from 'react'

const PAGE_SIZE = 20

/** The current page of `items`, plus what <Pagination> needs. */
export function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  // Stay on a real page if a re-sync or delete shrinks the list.
  const current = Math.min(page, pageCount - 1)
  const first = current * PAGE_SIZE
  const rows = items.slice(first, first + PAGE_SIZE)
  return { rows, pager: { current, pageCount, first, shown: rows.length, total: items.length, setPage } }
}

export type Pager = ReturnType<typeof usePagination<unknown>>['pager']
