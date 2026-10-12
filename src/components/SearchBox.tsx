import { Search, X } from 'lucide-react'

import { Input } from '@/components/ui/input'

/** A search field with a clear button. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        inputMode="search"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        className="bg-card h-9 rounded-full pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full"
          onClick={() => onChange('')}
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">ล้างคำค้นหา</span>
        </button>
      )}
    </div>
  )
}
