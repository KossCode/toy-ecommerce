import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type Brand, type BrandMapping, type BrandsFile } from '@/api/client'
import { Button, Input, PageHeader, StatusChip } from '@/components/ui'

type Tab = 'all' | 'attention'

const CHANNELS = [
  { key: 'rozetka' as const, label: 'Rozetka' },
  { key: 'epicentr' as const, label: 'Epicentr' },
  { key: 'prom' as const, label: 'Prom' },
]

function mappingTone(status: BrandMapping['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'mapped') return 'success'
  if (status === 'missing_dictionary' || status === 'missing_prom') return 'warning'
  return 'neutral'
}

function needsAttention(b: Brand) {
  if (b.unnamed) return true
  return Object.values(b.mappings).some(
    (m) => m.status === 'missing_dictionary' || m.status === 'missing_prom',
  )
}

export function BrandsPage() {
  const [data, setData] = useState<BrandsFile | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>('hot-wheels')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'all'

  async function load() {
    setData(await api.getBrands())
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const list = tab === 'attention' ? data.brands.filter(needsAttention) : data.brands
    return [...list].sort((a, b) => {
      if (a.unnamed !== b.unnamed) return a.unnamed ? 1 : -1
      return b.productCount - a.productCount
    })
  }, [data, tab])

  const selected = data?.brands.find((b) => b.id === selectedId) ?? null
  const attentionCount = data?.brands.filter(needsAttention).length ?? 0

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const created = await api.createBrand({ name })
      await load()
      setSelectedId(created.id)
      setAdding(false)
      setNewName('')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setSaving(false)
    }
  }

  async function recheck(id: string) {
    setSaving(true)
    try {
      const res = await api.recheckBrand(id)
      setData((prev) =>
        prev
          ? {
              ...prev,
              meta: res.meta,
              brands: prev.brands.map((b) => (b.id === res.brand.id ? res.brand : b)),
            }
          : prev,
      )
      setNotice(`Довідник перевірено · ${res.meta.dictionariesUpdatedAt}`)
    } finally {
      setSaving(false)
    }
  }

  async function copyLetter(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Лист скопійовано')
    } catch {
      setNotice('Не вдалося скопіювати')
    }
  }

  if (!data) {
    return <div className="text-sm text-[var(--text-secondary)]">Завантаження…</div>
  }

  return (
    <div>
      <PageHeader
        title="Бренди"
        meta={`${data.meta.total} брендів`}
        actions={<Button onClick={() => setAdding(true)}>Додати бренд</Button>}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            { id: 'all' as const, label: `Усі ${data.meta.total}` },
            { id: 'attention' as const, label: `Потребують уваги ${attentionCount}` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams(t.id === 'all' ? {} : { tab: t.id })}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-[var(--primary)] text-white'
                : 'bg-white text-[var(--text)] border border-[var(--border)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div className="mb-3 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
          {notice}
        </div>
      ) : null}

      {adding ? (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-white p-3">
          <label className="min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Назва</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Новий бренд"
              autoFocus
            />
          </label>
          <Button disabled={saving || !newName.trim()} onClick={() => void handleAdd()}>
            Зберегти
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setAdding(false)
              setNewName('')
            }}
          >
            Скасувати
          </Button>
        </div>
      ) : null}

      <div className="overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 font-medium">Бренд</th>
              <th className="px-3 py-2 text-right font-medium">Товарів</th>
              <th className="px-3 py-2 font-medium">Rozetka</th>
              <th className="px-3 py-2 font-medium">Epicentr</th>
              <th className="px-3 py-2 font-medium">Prom</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const active = selectedId === b.id
              return (
                <tr
                  key={b.id}
                  className={`cursor-pointer border-t border-[var(--border)] ${
                    active ? 'bg-[#e4f1ef]' : 'hover:bg-[var(--bg)]'
                  } ${b.unnamed ? 'text-[var(--text-secondary)]' : ''}`}
                  onClick={() => setSelectedId(b.id)}
                >
                  <td className="px-3 py-2.5 font-medium">
                    {b.unnamed ? (
                      <Link
                        to="/products?brand="
                        className="text-[var(--primary)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {b.name}
                      </Link>
                    ) : (
                      b.name
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{b.productCount}</td>
                  {CHANNELS.map(({ key }) => (
                    <td key={key} className="px-3 py-2.5">
                      {b.mappings[key].status === 'dash' ? (
                        <span>—</span>
                      ) : (
                        <StatusChip tone={mappingTone(b.mappings[key].status)}>
                          {b.mappings[key].label}
                        </StatusChip>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l border-[var(--border)] bg-white shadow-lg">
          <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <Button variant="quiet" onClick={() => setSelectedId(null)}>
              Закрити
            </Button>
          </header>
          <div className="flex-1 space-y-4 overflow-auto p-5 text-sm">
            <div>
              <div className="text-[var(--text-secondary)]">Товарів</div>
              <div className="mt-0.5 text-base font-medium tabular-nums">{selected.productCount}</div>
              {selected.unnamed ? (
                <Link to="/products?brand=" className="mt-2 inline-block text-[var(--primary)] hover:underline">
                  Показати товари без бренда
                </Link>
              ) : (
                <Link
                  to={`/products?brand=${encodeURIComponent(selected.name)}`}
                  className="mt-2 inline-block text-[var(--primary)] hover:underline"
                >
                  Показати товари
                </Link>
              )}
            </div>

            {CHANNELS.map(({ key, label }) => {
              const map = selected.mappings[key]
              return (
                <section key={key} className="rounded-[var(--radius)] border border-[var(--border)] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{label}</h3>
                    {map.status === 'dash' ? (
                      <span className="text-[var(--text-secondary)]">—</span>
                    ) : (
                      <StatusChip tone={mappingTone(map.status)}>{map.label}</StatusChip>
                    )}
                  </div>
                  {map.value ? <div className="mb-2">{map.value}</div> : null}
                  {map.hint ? <p className="mb-3 text-[var(--text-secondary)]">{map.hint}</p> : null}
                  {map.letter || map.status === 'missing_dictionary' || map.status === 'missing_prom' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {map.letter ? (
                        <Button
                          variant="secondary"
                          disabled={saving}
                          onClick={() => void copyLetter(map.letter!)}
                        >
                          Скопіювати лист менеджеру
                        </Button>
                      ) : null}
                      <Button variant="quiet" disabled={saving} onClick={() => void recheck(selected.id)}>
                        Перевірити ще раз
                      </Button>
                    </div>
                  ) : null}
                  {(map.status === 'missing_dictionary' || map.status === 'missing_prom') && (
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      Довідник оновлено {data.meta.dictionariesUpdatedAt}
                    </p>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
