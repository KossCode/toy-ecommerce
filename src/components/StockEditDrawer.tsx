import { useState } from 'react'
import { api, type Product } from '@/api/client'
import { Button, Input, Select } from '@/components/ui'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'

/** Side drawer to set product «всього» (available = total − reserve). */
export function StockEditDrawer({
  products,
  initialSku,
  onClose,
  onSaved,
}: {
  products: Product[]
  initialSku: string
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [editSku, setEditSku] = useState(initialSku)
  const [newTotal, setNewTotal] = useState(
    () => products.find((p) => p.sku === initialSku)?.total ?? 0,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(true, onClose)
  useBodyScrollLock(true)

  const selected = products.find((p) => p.sku === editSku)
  const previewAvailable = selected ? Math.max(0, newTotal - selected.reserve) : 0

  if (!selected) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Змінити залишок"
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-white shadow-lg"
      >
        <header className="border-b border-[var(--border)] px-5 py-4 text-lg font-semibold">
          Змінити залишок
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 text-sm" data-modal-scroll>
          <label className="block">
            <span className="mb-1 block text-[var(--text-secondary)]">Товар</span>
            <Select
              value={editSku}
              onChange={(e) => {
                const p = products.find((x) => x.sku === e.target.value)
                setEditSku(e.target.value)
                if (p) setNewTotal(p.total)
              }}
              className="w-full"
            >
              {products.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} · {(p.name ?? '').trim() || 'Без назви'}
                </option>
              ))}
            </Select>
          </label>
          <div className="rounded-md bg-[var(--bg)] px-3 py-2 text-[var(--text-secondary)]">
            Всього {selected.total} · резерв {selected.reserve} · доступно {selected.available}
          </div>
          <label className="block">
            <span className="mb-1 block text-[var(--text-secondary)]">Нове значення «всього»</span>
            <Input
              type="number"
              min={selected.reserve}
              value={newTotal}
              onChange={(e) => setNewTotal(Number(e.target.value))}
            />
          </label>
          <div>
            Буде доступно: <strong>{previewAvailable}</strong>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Доступно = всього − резерв. Новий доступний залишок піде на маркетплейси, де товар
            увімкнено.
          </p>
          {error ? <p className="text-[var(--error)]">{error}</p> : null}
        </div>
        <footer className="flex gap-2 border-t border-[var(--border)] p-4">
          <Button
            disabled={saving || newTotal < selected.reserve}
            onClick={() => {
              void (async () => {
                try {
                  setSaving(true)
                  setError(null)
                  await api.patchProduct(editSku, { total: newTotal })
                  await onSaved()
                  onClose()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Помилка')
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            Зберегти
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Скасувати
          </Button>
        </footer>
      </div>
    </div>
  )
}
