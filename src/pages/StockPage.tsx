import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type Product } from '@/api/client'
import {
  Button,
  FilterTab,
  Input,
  ListFilters,
  PageHeader,
  Select,
  StatusChip,
  StockDot,
  chipTone,
} from '@/components/ui'
import { useEscapeKey } from '@/hooks/useEscapeKey'

type Tab = 'all' | 'low' | 'oos' | 'reserved'

function syncs(p: Product) {
  if (p.status === 'Чернетка') return false
  return Object.values(p.channels).some((c) => c !== '—' && c !== 'Вимкнено')
}

export function StockPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [editSku, setEditSku] = useState('')
  const [newTotal, setNewTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') as Tab) || 'all'

  async function load() {
    setProducts(await api.getProducts())
  }

  useEffect(() => {
    void load()
  }, [])

  useEscapeKey(panelOpen, () => setPanelOpen(false))

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (tab === 'low' && p.stockLabel !== 'Закінчується') return false
      if (tab === 'oos' && p.stockLabel !== 'Немає в наявності' && p.stockLabel !== 'Очікується')
        return false
      if (tab === 'reserved' && p.reserve <= 0) return false
      if (q) {
        const s = q.toLowerCase()
        if (!`${p.name} ${p.sku}`.toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [products, tab, q])

  const selected = products.find((p) => p.sku === editSku)
  const previewAvailable = selected
    ? Math.max(0, newTotal - selected.reserve)
    : 0

  const lowCount = products.filter((p) => p.stockLabel === 'Закінчується').length
  const oosCount = products.filter(
    (p) => p.stockLabel === 'Немає в наявності' || p.stockLabel === 'Очікується',
  ).length
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: products.length },
    { id: 'low', label: 'Закінчуються', count: lowCount },
    { id: 'oos', label: 'Немає в наявності', count: oosCount },
    {
      id: 'reserved',
      label: 'З резервом',
      count: products.filter((p) => p.reserve > 0).length,
    },
  ]

  function openEdit(sku?: string) {
    const p = products.find((x) => x.sku === (sku ?? products[0]?.sku))
    if (!p) return
    setEditSku(p.sku)
    setNewTotal(p.total)
    setError(null)
    setPanelOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Наявність"
        meta={`${products.length} товарів · ${lowCount} закінчуються · ${oosCount} немає / очікується`}
        actions={<Button onClick={() => openEdit()}>Змінити залишок</Button>}
      />

      <ListFilters
        tabs={tabs.map((t) => (
          <FilterTab
            key={t.id}
            active={tab === t.id}
            onClick={() => navigate(t.id === 'all' ? '/stock' : `/stock?tab=${t.id}`)}
          >
            {t.label}
            <span className={tab === t.id ? 'opacity-80' : 'text-[var(--text-secondary)]'}>
              {' '}
              {t.count}
            </span>
          </FilterTab>
        ))}
        footer="Доступно = всього − резерв. На маркетплейси передається доступно. Нове замовлення резервує залишок одразу."
      >
        <Input
          className="min-w-[200px] max-w-xs flex-1"
          placeholder="Назва або артикул"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select defaultValue="">
          <option value="">Категорія</option>
        </Select>
        <Select defaultValue="">
          <option value="">Наявність</option>
        </Select>
        <button
          type="button"
          className="ml-auto text-sm text-[var(--primary)] hover:underline"
          onClick={() => setQ('')}
        >
          Скинути
        </button>
      </ListFilters>

      <div className="overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 font-medium">Товар</th>
              <th className="px-3 py-2 text-right font-medium">Всього</th>
              <th className="px-3 py-2 text-right font-medium">Резерв</th>
              <th className="px-3 py-2 text-right font-medium">Доступно</th>
              <th className="px-3 py-2 font-medium">Наявність</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Синк</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.sku} className="border-t border-[var(--border)] hover:bg-[var(--bg)]/60">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--bg)] text-[10px] text-[var(--text-secondary)]">
                      foto
                    </div>
                    <div>
                      <Link className="font-medium text-[var(--primary)]" to={`/products/${p.sku}`}>
                        {p.name}
                      </Link>
                      <div className="text-xs text-[var(--text-secondary)]">{p.sku}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">{p.total}</td>
                <td className="px-3 py-2.5 text-right">
                  {p.reserve > 0 ? (
                    <Link className="text-[var(--primary)]" to="/orders">
                      {p.reserve} замовлення
                    </Link>
                  ) : (
                    0
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-medium">{p.available}</td>
                <td className="px-3 py-2.5">
                  <StockDot label={p.stockLabel} />
                </td>
                <td className="px-3 py-2.5">
                  <StatusChip tone={chipTone(p.status)}>{p.status}</StatusChip>
                </td>
                <td className="px-3 py-2.5">{syncs(p) ? 'Так' : 'Ні'}</td>
                <td className="px-3 py-2.5 text-right">
                  <Button variant="quiet" onClick={() => openEdit(p.sku)}>
                    Змінити
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {panelOpen && selected ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-[var(--border)] bg-white shadow-lg">
          <div className="flex h-full flex-col">
            <header className="border-b border-[var(--border)] px-5 py-4 text-lg font-semibold">
              Змінити залишок
            </header>
            <div className="flex-1 space-y-4 overflow-auto p-5 text-sm">
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
                      {p.sku} · {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="rounded-md bg-[var(--bg)] px-3 py-2 text-[var(--text-secondary)]">
                Всього {selected.total} · резерв {selected.reserve} · доступно {selected.available}
              </div>
              <label className="block">
                <span className="mb-1 block text-[var(--text-secondary)]">
                  Нове значення «всього»
                </span>
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
                Новий доступний залишок одразу піде на Rozetka, Epicentr і Prom (де товар увімкнено).
              </p>
              {error ? <p className="text-[var(--error)]">{error}</p> : null}
            </div>
            <footer className="flex gap-2 border-t border-[var(--border)] p-4">
              <Button
                disabled={saving}
                onClick={async () => {
                  try {
                    setSaving(true)
                    setError(null)
                    await api.patchProduct(editSku, { total: newTotal })
                    await load()
                    setPanelOpen(false)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Помилка')
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Зберегти
              </Button>
              <Button variant="secondary" onClick={() => setPanelOpen(false)}>
                Скасувати
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
