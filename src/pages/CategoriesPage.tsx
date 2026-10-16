import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  type CategoriesFile,
  type Category,
  type CategoryMapping,
} from '@/api/client'
import { Button, Input, PageHeader, Panel, Select, StatusChip } from '@/components/ui'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'

const CHANNELS = [
  { key: 'rozetka' as const, label: 'Rozetka' },
  { key: 'epicentr' as const, label: 'Epicentr' },
  { key: 'prom' as const, label: 'Prom' },
]

export function CategoriesPage() {
  const [data, setData] = useState<CategoriesFile | null>(null)
  const [selectedId, setSelectedId] = useState('constructors')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ constructors: true })
  const [adding, setAdding] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const next = await api.getCategories()
    setData(next)
  }

  useEffect(() => {
    void load()
  }, [])

  const roots = useMemo(() => {
    if (!data) return []
    return data.categories
      .filter((c) => c.parentId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }, [data])

  const childrenOf = useMemo(() => {
    const map = new Map<string, Category[]>()
    if (!data) return map
    for (const c of data.categories) {
      if (!c.parentId) continue
      const list = map.get(c.parentId) ?? []
      list.push(c)
      map.set(c.parentId, list)
    }
    for (const [, list] of map) list.sort((a, b) => a.sortOrder - b.sortOrder)
    return map
  }, [data])

  const selected = data?.categories.find((c) => c.id === selectedId) ?? null
  const parentName = selected?.parentId
    ? (data?.categories.find((c) => c.id === selected.parentId)?.name ?? '—')
    : '—'

  function openAdd(parentId: string | null = null) {
    setAddParentId(parentId)
    setAdding(true)
  }

  async function handleCreated(created: Category) {
    await load()
    setSelectedId(created.id)
    if (created.parentId) {
      setExpanded((prev) => ({ ...prev, [created.parentId!]: true }))
    }
    setAdding(false)
  }

  async function refreshDictionaries() {
    setSaving(true)
    try {
      const next = await api.refreshCategoryDictionaries()
      setData(next)
      setNotice(`Довідники оновлено · ${next.meta.dictionariesUpdatedAt}`)
    } finally {
      setSaving(false)
    }
  }

  async function setMapping(channel: keyof Category['mappings'], leafId: string) {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.patchCategory(selected.id, {
        mappings: {
          [channel]: leafId ? { leafId } : { leafId: null },
        },
      })
      setData((prev) =>
        prev
          ? {
              ...prev,
              categories: prev.categories.map((c) => (c.id === updated.id ? updated : c)),
            }
          : prev,
      )
    } finally {
      setSaving(false)
    }
  }

  function renderRow(cat: Category, depth: number) {
    const kids = childrenOf.get(cat.id) ?? []
    const hasKids = kids.length > 0
    const isOpen = expanded[cat.id]
    const isSelected = selectedId === cat.id

    return (
      <div key={cat.id}>
        <div
          className={`flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm ${
            isSelected ? 'bg-[#e4f1ef] text-[var(--primary)]' : 'hover:bg-[var(--bg)]'
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <span className="w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden>
            ⋮⋮
          </span>
          {hasKids ? (
            <button
              type="button"
              className="w-5 shrink-0 text-[var(--text-secondary)]"
              onClick={() => setExpanded((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
              aria-label={isOpen ? 'Згорнути' : 'Розгорнути'}
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-medium"
            onClick={() => setSelectedId(cat.id)}
          >
            {cat.name}
          </button>
          <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{cat.productCount}</span>
        </div>
        {hasKids && isOpen ? kids.map((child) => renderRow(child, depth + 1)) : null}
      </div>
    )
  }

  if (!data) {
    return <div className="text-sm text-[var(--text-secondary)]">Завантаження…</div>
  }

  return (
    <div>
      <PageHeader
        title="Категорії"
        meta={`${data.meta.topLevelCount} категорій · ${data.meta.productTotal} товарів`}
        actions={
          <>
            <Button onClick={() => openAdd(null)}>Додати категорію</Button>
            <Button variant="secondary" disabled={saving} onClick={() => void refreshDictionaries()}>
              Оновити довідники маркетплейсів
            </Button>
          </>
        }
      />

      {notice ? (
        <div className="mb-3 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel>
          <div className="mb-2 space-y-0.5">{roots.map((c) => renderRow(c, 0))}</div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            Порядок перетягуванням. Так категорії стоятимуть у меню сайту Trio Mio.
          </p>
        </Panel>

        {selected ? (
          <div className="space-y-4">
            <Panel title="Основне">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--text-secondary)]">Назва</dt>
                  <dd className="mt-0.5 font-medium">{selected.name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-secondary)]">Батьківська</dt>
                  <dd className="mt-0.5 font-medium">{parentName}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-secondary)]">Товарів</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{selected.productCount}</dd>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Link
                    to={`/products?category=${encodeURIComponent(selected.name)}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    Показати товари
                  </Link>
                  <button
                    type="button"
                    className="text-[var(--primary)] hover:underline"
                    onClick={() => openAdd(selected.id)}
                  >
                    + Дочірня категорія
                  </button>
                </div>
              </dl>
            </Panel>

            <Panel title="Категорії на маркетплейсах">
              <div className="space-y-3">
                {CHANNELS.map(({ key, label }) => (
                  <MappingRow
                    key={key}
                    label={label}
                    mapping={selected.mappings[key]}
                    leaves={data.marketplaceLeaves[key]}
                    disabled={saving}
                    onChange={(leafId) => void setMapping(key, leafId)}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Лише кінцеві (листові) категорії маркетплейсів. Довідники оновлено{' '}
                {data.meta.dictionariesUpdatedAt}.
              </p>
            </Panel>
          </div>
        ) : (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white p-8 text-sm text-[var(--text-secondary)]">
            Оберіть категорію зліва
          </div>
        )}
      </div>

      {adding ? (
        <AddCategoryModal
          categories={data.categories}
          initialParentId={addParentId}
          onClose={() => setAdding(false)}
          onCreated={(c) => void handleCreated(c)}
        />
      ) : null}
    </div>
  )
}

function AddCategoryModal({
  categories,
  initialParentId,
  onClose,
  onCreated,
}: {
  categories: Category[]
  initialParentId: string | null
  onClose: () => void
  onCreated: (created: Category) => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(initialParentId)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEscapeKey(true, onClose)
  useBodyScrollLock(true)

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c.id, c.name)
    return m
  }, [categories])

  const parentOptions = useMemo(() => {
    return [...categories]
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
      .map((c) => {
        const parts: string[] = [c.name]
        let pid = c.parentId
        while (pid) {
          const n = nameById.get(pid)
          if (!n) break
          parts.unshift(n)
          pid = categories.find((x) => x.id === pid)?.parentId ?? null
        }
        return { id: c.id, label: parts.join(' › ') }
      })
  }, [categories, nameById])

  const parentLabel =
    parentId == null
      ? 'Корінь меню (топ-рівень)'
      : (parentOptions.find((o) => o.id === parentId)?.label ?? '—')

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Вкажіть назву')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await api.createCategory({ name: trimmed, parentId })
      onCreated(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onWheel={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-category-title"
        className="w-full max-w-md overflow-hidden rounded-[var(--radius)] bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="add-category-title" className="text-lg font-semibold">
              Нова категорія
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Спочатку дерево CRM — мапінг на маркетплейси після збереження
            </p>
          </div>
          <button
            type="button"
            className="rounded px-2 text-lg text-[var(--text-secondary)] hover:bg-[var(--bg)]"
            onClick={onClose}
            aria-label="Закрити"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Назва</span>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Наприклад: LEGO Technic"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submit()
                }
              }}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Батьківська категорія</span>
            <Select
              className="w-full"
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
            >
              <option value="">— Корінь меню (топ-рівень) —</option>
              {parentOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            <span className="mt-1 block text-xs text-[var(--text-secondary)]">
              Зʼявиться в: {parentLabel}
              {name.trim() ? ` › ${name.trim()}` : ''}
            </span>
          </label>

          {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Скасувати
          </Button>
          <Button disabled={saving || !name.trim()} onClick={() => void submit()}>
            {saving ? 'Збереження…' : 'Створити'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MappingRow({
  label,
  mapping,
  leaves,
  disabled,
  onChange,
}: {
  label: string
  mapping: CategoryMapping
  leaves: { id: string; name: string }[]
  disabled?: boolean
  onChange: (leafId: string) => void
}) {
  const mapped = Boolean(mapping.leafId && mapping.name)

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3 sm:flex-row sm:items-center">
      <div className="w-24 shrink-0 text-sm font-medium">{label}</div>
      <div className="min-w-0 flex-1">
        <Select
          className="w-full"
          disabled={disabled}
          value={mapping.leafId ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Оберіть категорію</option>
          {leaves.map((leaf) => (
            <option key={leaf.id} value={leaf.id}>
              {leaf.name}
            </option>
          ))}
        </Select>
        {mapped && mapping.secondary ? (
          <div className="mt-1 text-xs text-[var(--text-secondary)]">{mapping.secondary}</div>
        ) : null}
      </div>
      <div className="shrink-0">
        {mapped ? (
          <StatusChip tone="success">Зіставлено</StatusChip>
        ) : (
          <StatusChip tone="warning">Не зіставлено</StatusChip>
        )}
      </div>
    </div>
  )
}
