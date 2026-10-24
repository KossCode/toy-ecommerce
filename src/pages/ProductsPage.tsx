import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type Product } from '@/api/client'
import { BulkActionBar } from '@/components/BulkActionBar'
import { StockEditDrawer } from '@/components/StockEditDrawer'
import {
  Button,
  FilterTab,
  Input,
  ListFilters,
  PageHeader,
  Select,
  SortableTh,
  StatusChip,
  StockDot,
  chipTone,
} from '@/components/ui'
import { money } from '@/lib/format'
import { compareValues, useTableSort } from '@/lib/tableSort'

type Tab = 'all' | 'draft' | 'off' | 'notReady' | 'low' | 'oos' | 'reserved'

/** Маркетплейси з інтеграцій (Instagram — лише канал замовлень, не лістинг). */
const MARKETPLACES = [
  { id: 'rozetka' as const, label: 'Rozetka' },
  { id: 'epicentr' as const, label: 'Epicentr' },
  { id: 'prom' as const, label: 'Prom' },
]

function isOffMarketplace(p: Product) {
  return MARKETPLACES.every((m) => {
    const v = p.channels[m.id] ?? '—'
    return v === '—' || v === 'Вимкнено'
  })
}

const CHANNEL_LABELS: Record<string, string> = {
  rozetka: 'Rozetka',
  epicentr: 'Epicentr',
  prom: 'Prom',
  site: 'Сайт',
}

function channelSummary(p: Product) {
  return Object.entries(p.channels)
    .map(([id, status]) => `${CHANNEL_LABELS[id] ?? id}: ${status}`)
    .join(' · ')
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkMarketplace, setBulkMarketplace] =
    useState<(typeof MARKETPLACES)[number]['id']>('rozetka')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [stockSku, setStockSku] = useState<string | null>(null)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') as Tab) || 'all'
  const categoryFilter = params.get('category') ?? ''
  const brandFilter = params.get('brand')
  const hasBrandFilter = params.has('brand')
  type ProductSortKey =
    | 'name'
    | 'category'
    | 'status'
    | 'price'
    | 'total'
    | 'available'
    | 'stockLabel'
    | 'syncStatus'
  const { sortKey, sortDir, toggle } = useTableSort<ProductSortKey>('name')

  async function load() {
    setProducts(await api.getProducts())
  }

  useEffect(() => {
    void load()
  }, [])

  async function addProduct() {
    try {
      setCreating(true)
      const created = await api.createProduct()
      navigate(`/products/${created.sku}`)
    } catch (e) {
      setBulkNotice(e instanceof Error ? e.message : 'Не вдалося створити товар')
    } finally {
      setCreating(false)
    }
  }

  const filtered = useMemo(() => {
    const rows = products.filter((p) => {
      if (tab === 'draft' && p.status !== 'Чернетка') return false
      if (tab === 'off' && !isOffMarketplace(p)) return false
      if (
        tab === 'notReady' &&
        p.syncStatus !== 'Є питання' &&
        p.syncStatus !== 'Помилка'
      )
        return false
      if (tab === 'low' && p.stockLabel !== 'Закінчується') return false
      if (
        tab === 'oos' &&
        p.stockLabel !== 'Немає в наявності' &&
        p.stockLabel !== 'Очікується'
      ) {
        return false
      }
      if (tab === 'reserved' && p.reserve <= 0) return false
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
    const valueOf = (p: Product): string | number => {
      switch (sortKey) {
        case 'name':
          return p.name || p.sku
        case 'category':
          return p.category
        case 'status':
          return p.status
        case 'price':
          return p.price
        case 'total':
          return p.total
        case 'available':
          return p.available
        case 'stockLabel':
          return p.stockLabel
        case 'syncStatus':
          return p.syncStatus
      }
    }
    return [...rows].sort((a, b) => compareValues(valueOf(a), valueOf(b), sortDir))
  }, [products, tab, q, categoryFilter, brandFilter, hasBrandFilter, sortKey, sortDir])

  async function setChannelForSelected(enabled: boolean) {
    const label = MARKETPLACES.find((m) => m.id === bulkMarketplace)?.label ?? bulkMarketplace
    const value = enabled ? 'Активний' : 'Вимкнено'
    try {
      setBulkBusy(true)
      setBulkNotice(null)
      await Promise.all(
        selected.map((sku) => api.patchProduct(sku, { channels: { [bulkMarketplace]: value } })),
      )
      await load()
      setBulkNotice(
        `${enabled ? 'Увімкнено' : 'Вимкнено'} на ${label}: ${selected.length} товар(ів)`,
      )
      setSelected([])
    } catch (e) {
      setBulkNotice(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setBulkBusy(false)
    }
  }

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
      count: products.filter((p) => isOffMarketplace(p)).length,
    },
    {
      id: 'notReady',
      label: 'Не готові',
      count: products.filter(
        (p) => p.syncStatus === 'Є питання' || p.syncStatus === 'Помилка',
      ).length,
    },
    {
      id: 'low',
      label: 'Закінчуються',
      count: products.filter((p) => p.stockLabel === 'Закінчується').length,
    },
    {
      id: 'oos',
      label: 'Немає в наявності',
      count: products.filter(
        (p) => p.stockLabel === 'Немає в наявності' || p.stockLabel === 'Очікується',
      ).length,
    },
    {
      id: 'reserved',
      label: 'З резервом',
      count: products.filter((p) => p.reserve > 0).length,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Товари"
        meta={`${products.length} товарів`}
        actions={
          <>
            <Button disabled={creating} onClick={() => void addProduct()}>
              {creating ? 'Створення…' : 'Додати товар'}
            </Button>
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
        footer="Доступно = всього − резерв. На маркетплейси йде доступно; нове замовлення резервує залишок."
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
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => {
            if (selected[0]) setStockSku(selected[0])
          }}
        >
          Змінити залишок
        </button>
        <Select
          className="h-8 border-white/35 bg-white/10 text-white"
          value={bulkMarketplace}
          disabled={bulkBusy}
          onChange={(e) =>
            setBulkMarketplace(e.target.value as (typeof MARKETPLACES)[number]['id'])
          }
          aria-label="Маркетплейс для bulk-дії"
        >
          {MARKETPLACES.map((m) => (
            <option key={m.id} value={m.id} className="text-[var(--text)]">
              {m.label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          disabled={bulkBusy}
          className="underline-offset-2 hover:underline disabled:opacity-50"
          onClick={() => void setChannelForSelected(true)}
        >
          Увімкнути
        </button>
        <button
          type="button"
          disabled={bulkBusy}
          className="underline-offset-2 hover:underline disabled:opacity-50"
          onClick={() => void setChannelForSelected(false)}
        >
          Вимкнути
        </button>
      </BulkActionBar>
      {bulkNotice ? (
        <p className="-mt-2 mb-3 text-sm text-[var(--text-secondary)]">{bulkNotice}</p>
      ) : null}

      <div className="overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[var(--text-secondary)]">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Фото</th>
              <SortableTh
                label="Товар"
                active={sortKey === 'name'}
                dir={sortDir}
                onClick={() => toggle('name')}
              />
              <SortableTh
                label="Категорія"
                active={sortKey === 'category'}
                dir={sortDir}
                onClick={() => toggle('category')}
              />
              <SortableTh
                label="Статус"
                active={sortKey === 'status'}
                dir={sortDir}
                onClick={() => toggle('status')}
              />
              <SortableTh
                label="Ціна"
                align="right"
                active={sortKey === 'price'}
                dir={sortDir}
                onClick={() => toggle('price')}
              />
              <SortableTh
                label="Всього"
                align="right"
                active={sortKey === 'total'}
                dir={sortDir}
                onClick={() => toggle('total')}
              />
              <SortableTh
                label="Доступно"
                align="right"
                active={sortKey === 'available'}
                dir={sortDir}
                onClick={() => toggle('available')}
              />
              <SortableTh
                label="Наявність"
                active={sortKey === 'stockLabel'}
                dir={sortDir}
                onClick={() => toggle('stockLabel')}
              />
              <SortableTh
                label="Синхронізація"
                active={sortKey === 'syncStatus'}
                dir={sortDir}
                onClick={() => toggle('syncStatus')}
              />
              <th className="px-3 py-2" />
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
                  <Link
                    className="block font-medium text-[var(--primary)] hover:underline"
                    to={`/products/${encodeURIComponent(p.sku)}`}
                  >
                    {(p.name ?? '').trim() ? p.name : 'Без назви'}
                    <span className="mt-0.5 block text-xs font-normal text-[var(--text-secondary)] no-underline">
                      {p.brand ? `${p.sku} · ${p.brand}` : p.sku}
                    </span>
                  </Link>
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
                <td className="px-3 py-2.5 text-right tabular-nums">{p.total}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="tabular-nums">{p.available} шт.</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {p.reserve > 0 ? (
                      <Link className="text-[var(--primary)] hover:underline" to="/orders">
                        резерв {p.reserve}
                      </Link>
                    ) : (
                      <>резерв {p.reserve}</>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <StockDot label={p.stockLabel} />
                </td>
                <td className="px-3 py-2.5" title={channelSummary(p)}>
                  <Link
                    to={`/products/${encodeURIComponent(p.sku)}`}
                    className="inline-flex"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <StatusChip tone={chipTone(p.syncStatus)}>{p.syncStatus}</StatusChip>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button variant="quiet" className="h-8 px-2" onClick={() => setStockSku(p.sku)}>
                    Залишок
                  </Button>
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

      {stockSku ? (
        <StockEditDrawer
          products={products}
          initialSku={stockSku}
          onClose={() => setStockSku(null)}
          onSaved={() => load()}
        />
      ) : null}
    </div>
  )
}
