import type { ReactNode } from 'react'

/** Shown only when there is a selection — no reserved empty gap above the table. */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children?: ReactNode
}) {
  if (count <= 0) return null

  return (
    <div className="mb-3 flex h-10 items-center gap-3 rounded-[var(--radius)] bg-[var(--primary)] px-3 text-sm text-white">
      <span className="font-medium">Вибрано {count}</span>
      {children}
      <button type="button" className="ml-auto underline" onClick={onClear}>
        Зняти виділення
      </button>
    </div>
  )
}
