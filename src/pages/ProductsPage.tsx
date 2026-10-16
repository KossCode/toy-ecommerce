import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type Product } from '@/api/client'
import { BulkActionBar } from '@/components/BulkActionBar'
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
import { money } from '@/lib/format'

type Tab = 'all' | 'draft' | 'off' | 'notReady' | 'low' | 'oos'

/** Маркетплейси з інтеграцій (Instagram — лише канал замовлень, не лістинг). */
const MARKETPLACES = ['Rozetka', 'Epicentr', 'Prom'] as const

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkMarketplace, setBulkMarketplace] =
    useState<(typeof MARKETPLACES)[number]>('Rozetka')
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') as Tab) || 'all'
  const categoryFilter = params.get('category') ?? ''
  const brandFilter = params.get('brand')
  const hasBrandFilter = params.has('brand')

  useEffect(() => {
    void api.getProducts().then(setProducts)
  }, [])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (tab === 'draft' && p.status !== 'Чернетка') return false
      if (tab === 'off' && p.syncStatus !== '—') return false
      if (tab === 'notReady' && p.syncStatus !== 'Є питання') return false
      if (tab === 'low' && p.stockLabel !== 'Закінчується') return false
      if (tab === 'oos' && p.stockLabel !== 'Немає в наявності') return false
      if (categoryFilter && p.category !== categoryFilter) return false
      if (hasBrandFilter) {
        const brand = brandFilter ?? ''
        if (brand === '' ? Boolean(p.brand) : p.brand !== brand) return false
      }
      if (q) {
        const s = q.toLowerCase()
        if (!`${p.name} ${p.sku} ${p.brand} ${p.barcode}`.toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [products, tab, q, categoryFilter, brandFilter, hasBrandFilter])

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: products.length },
    {
      id: 'draft',
      label: 'Чернетки',
      count: products.filter((p) => p.status === 'Чернетка').length,
    },
    {
      id: 'off',
      label: 'Не на маркетплейсах',
      count: products.filter((p) => p.syncStatus === '—').length,
    },
    {
      id: 'notReady',
      label: 'Не готові',
      count: products.filter((p) => p.syncStatus === 'Є питання').length,
    },
    {
      id: 'low',
      label: 'Закінчуються',
      count: products.filter((p) => p.stockLabel === 'Закінчується').length,
    },
    {
      id: 'oos',
      label: 'Немає в наявності',
      count: products.filter((p) => p.stockLabel === 'Немає в наявності').length,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Товари"
        meta={`${products.length} товарів`}
        actions={
          <>
            <Button>Додати товар</Button>
            <Button variant="secondary">Імпорт</Button>
            <Button variant="secondary">Експорт</Button>
          </>
        }
      />

      <ListFilters
        tabs={tabs.map((t) => (
          <FilterTab
            key={t.id}
            active={tab === t.id}
            onClick={() => navigate(t.id === 'all' ? '/products' : `/products?tab=${t.id}`)}
          >
            {t.label}
            <span className={tab === t.id ? 'opacity-80' : 'text-[var(--text-secondary)]'}>
              {' '}
              {t.count}
            </span>
          </FilterTab>
        ))}
      >
        <Input
          className="min-w-[200px] max-w-xs flex-1"
          placeholder="Назва, артикул або штрихкод"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select defaultValue="">
          <option value="">Категорія</option>
        </Select>
        <Select defaultValue="">
          <option value="">Статус</option>
        </Select>
        <Select defaultValue="">
          <option value="">Наявність</option>
        </Select>
        <Select defaultValue="">
          <option value="">Синхронізація</option>
        </Select>
        <button
          type="button"
          className="ml-auto text-sm text-[var(--primary)] hover:underline"
          onClick={() => setQ('')}
        >
          Скинути
        </button>
      </ListFilters>

      <BulkActionBar
        count={selected.length}
        onClear={() => {
          setSelected([])
          setBulkNotice(null)
        }}
      >
        <button type="button" className="underline-offset-2 hover:underline">
          Змінити ціну
        </button>
        <button type="button" className="underline-offset-2 hover:underline">
          Змінити кількість
        </button>
        <Select
          className="h-8 border-white/35 bg-white/10 text-white"
          value={bulkMarketplace}
          onChange={(e) =>
            setBulkMarketplace(e.target.value as (typeof MARKETPLACES)[number])
          }
          aria-label="Маркетплейс для bulk-дії"
        >
          {MARKETPLACES.map((m) => (
            <option key={m} value={m} className="text-[var(--text)]">
              {m}
            </option>
          ))}
        </Select>
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() =>
            setBulkNotice(
              `Увімкнено на ${bulkMarketplace}: ${selected.length} товар(ів) (мок)`,
            )
          }
        >
          Увімкнути
        </button>
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() =>
            setBulkNotice(
              `Вимкнено на ${bulkMarketplace}: ${selected.length} товар(ів) (мок)`,
            )
          }
        >
          Вимкнути
        </button>
      </BulkActionBar>
      {bulkNotice ? (
        <p className="-mt-2 mb-3 text-sm text-[var(--text-secondary)]">{bulkNotice}</p>
      ) : null}

      <div className="overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[var(--text-secondary)]">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Фото</th>
              <th className="px-3 py-2 font-medium">Товар</th>
              <th className="px-3 py-2 font-medium">Категорія</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 text-right font-medium">Ціна</th>
              <th className="px-3 py-2 text-right font-medium">Доступно</th>
              <th className="px-3 py-2 font-medium">Наявність</th>
              <th className="px-3 py-2 font-medium">Синхронізація</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.sku} className="border-t border-[var(--border)] hover:bg-[var(--bg)]/60">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.sku)}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.includes(p.sku) ? prev.filter((x) => x !== p.sku) : [...prev, p.sku],
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--bg)] text-[10px] text-[var(--text-secondary)]">
                    foto
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Link className="font-medium text-[var(--primary)]" to={`/products/${p.sku}`}>
                    {p.name}
                  </Link>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {p.brand ? `${p.sku} · ${p.brand}` : p.sku}
                  </div>
                  {p.duplicateOf ? (
                    <div className="text-xs text-[var(--text-secondary)]">
                      дубль кольору {p.duplicateOf}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">{p.category}</td>
                <td className="px-3 py-2.5">
                  <StatusChip tone={chipTone(p.status)}>{p.status}</StatusChip>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div>{money(p.price)}</div>
                  {p.oldPrice ? (
                    <div className="text-xs text-[var(--text-secondary)] line-through">
                      {money(p.oldPrice)}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div>{p.available} шт.</div>
                  <div className="text-xs text-[var(--text-secondary)]">резерв {p.reserve}</div>
                </td>
                <td className="px-3 py-2.5">
                  <StockDot label={p.stockLabel} />
                </td>
                <td className="px-3 py-2.5" title={p.syncHint}>
                  <StatusChip tone={chipTone(p.syncStatus)}>
                    {p.syncStatus === 'Є питання' ? `! ${p.syncStatus}` : p.syncStatus}
                  </StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-sm text-[var(--text-secondary)]">
        1–{filtered.length} з {filtered.length}
        {filtered.length !== products.length ? ` (усього ${products.length})` : ''}
      </div>
    </div>
  )
}
