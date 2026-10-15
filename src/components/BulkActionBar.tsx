import type { ReactNode } from 'react'

/** Always reserves height so the table below does not jump when selection appears. */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children?: ReactNode
}) {
  const active = count > 0

  return (
    <div className="mb-3 min-h-10">
      <div
        className={`flex h-10 items-center gap-3 rounded-[var(--radius)] px-3 text-sm transition-opacity ${
          active
            ? 'bg-[var(--primary)] text-white opacity-100'
            : 'pointer-events-none border border-transparent bg-transparent opacity-0'
        }`}
        aria-hidden={!active}
      >
        <span className="font-medium">Вибрано {count}</span>
        {children}
        <button type="button" className="ml-auto underline" onClick={onClear}>
          Зняти виділення
        </button>
      </div>
    </div>
  )
}
