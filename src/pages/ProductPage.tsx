import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Category, type Product, type ProductHistoryItem } from '@/api/client'
import {
  Button,
  Input,
  PageHeader,
  Panel,
  StatusChip,
  StockDot,
  Textarea,
  chipTone,
} from '@/components/ui'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { formatDateTime, money } from '@/lib/format'
import {
  checkDescriptionForMarketplaces,
  checkNameForMarketplaces,
  DESCRIPTION_RULES,
  NAME_RULES,
  type FieldCheck,
} from '@/lib/marketplaceText'

const tabs = ['Основне', 'Атрибути', 'Ціни і наявність', 'Маркетплейси', 'Історія'] as const

export function ProductPage() {
  const { sku = '' } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [draft, setDraft] = useState<Partial<Product>>({})
  const [tab, setTab] = useState<(typeof tabs)[number]>('Основне')
  const [history, setHistory] = useState<ProductHistoryItem[]>([])
  const [historyFilter, setHistoryFilter] = useState('Усі')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [crmCategories, setCrmCategories] = useState<Category[]>([])
  const [pickingCategory, setPickingCategory] = useState(false)
  const dirty = Object.keys(draft).length > 0

  async function load() {
    const [p, h, cats] = await Promise.all([
      api.getProduct(sku),
      api.getProductHistory(sku),
      api.getCategories(),
    ])
    setProduct(p)
    setHistory(h)
    setCrmCategories(cats.categories)
    setDraft({})
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Помилка'))
  }, [sku])

  const viewName = draft.name ?? product?.name ?? ''
  const viewDescription = draft.description ?? product?.description ?? ''
  const nameChecks = useMemo(() => checkNameForMarketplaces(viewName), [viewName])
  const descriptionChecks = useMemo(
    () => checkDescriptionForMarketplaces(viewDescription),
    [viewDescription],
  )
  const nameMax = Math.max(...Object.values(NAME_RULES).map((r) => r.max))
  const descriptionMax = Math.max(...Object.values(DESCRIPTION_RULES).map((r) => r.max))

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!product) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  const view = { ...product, ...draft }

  function setField<K extends keyof Product>(key: K, value: Product[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function save() {
    if (!product) return
    setSaving(true)
    try {
      const next = await api.patchProduct(product.sku, draft)
      setProduct(next)
      setDraft({})
    } finally {
      setSaving(false)
    }
  }

  const prices = product.marketplacePrices
  const filteredHistory =
    historyFilter === 'Усі' ? history : history.filter((h) => h.kind === historyFilter)

  return (
    <div>
      <div className="mb-2 text-sm text-[var(--text-secondary)]">
        <Link to="/products" className="text-[var(--primary)]">
          Товари
        </Link>{' '}
        / {product.sku}
      </div>
      <PageHeader
        title={view.name || 'Без назви'}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusChip tone={chipTone(product.status)}>{product.status}</StatusChip>
            <StockDot label={product.stockLabel} />
            <span>
              {[product.sku, product.brand || null, product.category]
                .filter(Boolean)
                .join(' · ')}{' '}
              · змінено {product.updatedBy}
            </span>
          </span>
        }
        actions={
          <>
            <Button disabled={!dirty || saving} onClick={() => void save()}>
              Зберегти
            </Button>
            <Button variant="secondary">…</Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm ${
              tab === t
                ? 'border-[var(--primary)] font-semibold text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {tab === 'Основне' ? (
            <Panel>
              <label className="block text-sm">
                <div className="mb-1 flex justify-between text-[var(--text-secondary)]">
                  <span>Назва</span>
                  <span>
                    {(view.name ?? '').length} / {nameMax}
                  </span>
                </div>
                <Input
                  value={view.name}
                  onChange={(e) => setField('name', e.target.value)}
                  maxLength={nameMax}
                />
                <MarketplaceIssues checks={nameChecks} />
              </label>
              <label className="mt-4 block text-sm">
                <div className="mb-1 flex justify-between text-[var(--text-secondary)]">
                  <span>Опис</span>
                  <span>
                    {(view.description ?? '').length} / {descriptionMax}
                  </span>
                </div>
                <Textarea
                  value={view.description}
                  onChange={(e) => setField('description', e.target.value)}
                  maxLength={descriptionMax}
                />
                <MarketplaceIssues checks={descriptionChecks} />
              </label>
              <div className="mt-4">
                <div className="mb-2 text-sm text-[var(--text-secondary)]">Фото</div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="relative flex h-20 w-20 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-secondary)]"
                    >
                      {n === 1 ? (
                        <span className="absolute left-1 top-1 rounded bg-white px-1 text-[10px]">
                          Головне
                        </span>
                      ) : null}
                      foto
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-xs text-[var(--primary)]"
                  >
                    Додати фото
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Артикул">
                  <Input value={product.sku} disabled />
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    На RZ/EC передається без дефіса.
                  </div>
                </Field>
                <Field label="Категорія CRM">
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-left text-sm hover:border-[var(--primary)]"
                    onClick={() => setPickingCategory(true)}
                  >
                    <span className={view.category ? '' : 'text-[var(--text-secondary)]'}>
                      {view.category || 'Оберіть категорію…'}
                    </span>
                    <span className="text-[var(--text-secondary)]">⋯</span>
                  </button>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    Мапінг на Rozetka / Epicentr / Prom підтягнеться з довідника категорій CRM.
                  </div>
                </Field>
                <Field label="Бренд (необовʼязково)">
                  <Input
                    value={view.brand}
                    onChange={(e) => setField('brand', e.target.value)}
                    placeholder="Зазвичай порожньо"
                  />
                </Field>
                <Field label="Модель">
                  <Input value={view.model} onChange={(e) => setField('model', e.target.value)} />
                </Field>
                <Field label="Штрихкод">
                  <Input value={view.barcode} onChange={(e) => setField('barcode', e.target.value)} />
                </Field>
                <Field label="Країна-виробник">
                  <Input value={view.country} onChange={(e) => setField('country', e.target.value)} />
                </Field>
                <Field label="Вага, кг">
                  <Input
                    type="number"
                    step="0.1"
                    value={view.weightKg ?? ''}
                    onChange={(e) =>
                      setField('weightKg', e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Габарити в упаковці, см">
                  <Input
                    value={view.dimensionsCm}
                    onChange={(e) => setField('dimensionsCm', e.target.value)}
                  />
                </Field>
              </div>
            </Panel>
          ) : null}

          {tab === 'Атрибути' ? (
            <Panel>
              <h2 className="text-base font-semibold">Фіксовані поля товару (не варіанти)</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Різний колір — окремий артикул через Дублювати.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Стан">
                  <Input
                    value={view.condition ?? ''}
                    onChange={(e) => setField('condition', e.target.value)}
                  />
                </Field>
                <Field label="Колір">
                  <Input value={view.color ?? ''} onChange={(e) => setField('color', e.target.value)} />
                </Field>
                <Field label="Вікова група">
                  <Input
                    value={view.ageGroup ?? ''}
                    onChange={(e) => setField('ageGroup', e.target.value)}
                  />
                </Field>
                <Field label="Матеріал">
                  <Input
                    value={view.material ?? ''}
                    onChange={(e) => setField('material', e.target.value)}
                  />
                </Field>
                <Field label="Тип">
                  <Input value={view.type ?? ''} onChange={(e) => setField('type', e.target.value)} />
                </Field>
                <Field label="Кількість деталей">
                  <Input
                    type="number"
                    value={view.partsCount ?? ''}
                    onChange={(e) =>
                      setField(
                        'partsCount',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                  />
                </Field>
                <Field label="Серія">
                  <Input
                    value={view.series ?? ''}
                    onChange={(e) => setField('series', e.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusChip tone="success">Rozetka: 5 з мінімум 3</StatusChip>
                {product.syncHint?.includes('Epicentr') ? (
                  <StatusChip tone="warning">Epicentr: є питання</StatusChip>
                ) : (
                  <StatusChip tone="success">Epicentr: обов’язкові заповнені</StatusChip>
                )}
              </div>
            </Panel>
          ) : null}

          {tab === 'Ціни і наявність' ? (
            <>
              <Panel title="Базова ціна">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Ціна, грн">
                    <Input
                      type="number"
                      value={view.price}
                      onChange={(e) => setField('price', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Стара ціна, грн">
                    <Input
                      type="number"
                      value={view.oldPrice ?? ''}
                      onChange={(e) =>
                        setField(
                          'oldPrice',
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                    />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Від базової ціни рахуються ціни на маркетплейсах.
                </p>
              </Panel>
              <Panel title="Наявність">
                <div className="text-sm">
                  Всього {product.total} · резерв {product.reserve} · доступно {product.available}
                </div>
                <Link className="mt-2 inline-block text-sm text-[var(--primary)]" to="/stock">
                  Змінити у «Наявність»
                </Link>
                <div className="mt-3 text-sm text-[var(--text-secondary)]">
                  Поріг «Закінчується»: 5
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(view.awaiting)}
                    onChange={(e) => setField('awaiting', e.target.checked)}
                  />
                  Очікується
                </label>
              </Panel>
              <Panel title="Ціни на маркетплейсах">
                {prices ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] table-fixed text-sm">
                      <thead className="text-[var(--text-secondary)]">
                        <tr className="border-b border-[var(--border)]">
                          <th className="w-[28%] py-2 pr-3 text-left font-medium">Маркетплейс</th>
                          <th className="w-[32%] py-2 px-3 text-right font-medium">Ціна</th>
                          <th className="w-[40%] py-2 pl-3 text-left font-medium">Правило</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            ['Rozetka', prices.rozetka],
                            ['Epicentr', prices.epicentr],
                            ['Prom', prices.prom],
                          ] as const
                        ).map(([name, row]) => (
                          <tr key={name} className="border-b border-[var(--border)] last:border-0">
                            <td className="py-2.5 pr-3">{name}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">
                              <div>{money(row.price)}</div>
                              {row.oldPrice ? (
                                <div className="text-xs text-[var(--text-secondary)] line-through">
                                  {money(row.oldPrice)}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2.5 pl-3 text-[var(--text-secondary)]">{row.rule}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Panel>
            </>
          ) : null}

          {tab === 'Маркетплейси' ? (
            <div className="space-y-3">
              {product.status === 'Чернетка' ? (
                <p className="text-sm text-[var(--warning)]">
                  Чернетка не синхронізується з маркетплейсами.
                </p>
              ) : null}
              {(['rozetka', 'epicentr', 'prom'] as const).map((key) => {
                const label = key === 'rozetka' ? 'Rozetka' : key === 'epicentr' ? 'Epicentr' : 'Prom'
                const status = view.channels?.[key] ?? '—'
                const enabled = status !== '—' && status !== 'Вимкнено'
                const price = prices?.[key]
                return (
                  <Panel key={key} title={label}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                          const next = { ...(view.channels ?? product.channels) }
                          next[key] = e.target.checked ? 'Активний' : '—'
                          setField('channels', next)
                        }}
                      />
                      Продавати на {label}
                    </label>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <StatusChip tone={chipTone(status)}>{status}</StatusChip>
                      {price ? <span>Передано: {money(price.price)}</span> : null}
                      <span className="text-[var(--text-secondary)]">
                        залишок {product.available} шт.
                      </span>
                    </div>
                    {key === 'epicentr' && product.syncHint?.includes('Epicentr') ? (
                      <p className="mt-2 text-sm text-[var(--warning)]">{product.syncHint}</p>
                    ) : null}
                    {key === 'epicentr' ? (
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        Epicentr не приймає кількість, лише статус.
                      </p>
                    ) : null}
                  </Panel>
                )
              })}
            </div>
          ) : null}

          {tab === 'Історія' ? (
            <Panel>
              <div className="mb-3 flex flex-wrap gap-2">
                {['Усі', 'Ціна', 'Наявність', 'Поля', 'Статус'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setHistoryFilter(f === 'Усі' ? 'Усі' : f)}
                    className={`rounded-full px-3 py-1 text-sm ${
                      historyFilter === f || (f === 'Усі' && historyFilter === 'Усі')
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] bg-white'
                    }`}
                  >
                    {f === 'Усі' ? 'Усі події' : f}
                  </button>
                ))}
              </div>
              <ul className="space-y-3 text-sm">
                {filteredHistory.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="flex gap-3">
                    <span className="w-28 shrink-0 text-[var(--text-secondary)]">
                      {formatDateTime(h.at)}
                    </span>
                    <span className="flex-1">{h.text}</span>
                    <span className="text-[var(--text-secondary)]">{h.who}</span>
                  </li>
                ))}
                {filteredHistory.length === 0 ? (
                  <li className="text-[var(--text-secondary)]">Подій немає.</li>
                ) : null}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          <Panel title="Наявність">
            <div className="text-2xl font-semibold">Доступно {product.available} шт.</div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">
              Всього {product.total} · резерв {product.reserve}
            </div>
          </Panel>
          <Panel title="Ціна">
            <div className="text-2xl font-semibold">{money(product.price)}</div>
            {product.oldPrice ? (
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="text-[var(--text-secondary)] line-through">
                  {money(product.oldPrice)}
                </span>
                <StatusChip tone="warning">
                  −{Math.round((1 - product.price / product.oldPrice) * 100)}%
                </StatusChip>
              </div>
            ) : null}
          </Panel>
          <Panel title="Маркетплейси">
            <ul className="space-y-2 text-sm">
              {Object.entries(product.channels).map(([key, status]) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span className="capitalize">{key}</span>
                  <StatusChip tone={chipTone(status)}>{status}</StatusChip>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              У списку товарів — колонка «Синхронізація»: {product.syncStatus}.
            </p>
          </Panel>
        </div>
      </div>

      {pickingCategory ? (
        <CategoryPickerModal
          categories={crmCategories}
          currentName={view.category}
          onClose={() => setPickingCategory(false)}
          onPick={(name) => {
            setField('category', name)
            setPickingCategory(false)
          }}
        />
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block text-sm">
      <div className="mb-1 text-[var(--text-secondary)]">{label}</div>
      {children}
    </div>
  )
}

/** Show hints only when there is a real marketplace issue (forbidden chars / over length). */
function MarketplaceIssues({ checks }: { checks: FieldCheck[] }) {
  const bad = checks.filter((c) => !c.ok)
  if (bad.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 text-xs text-[var(--warning)]">
      {bad.map((c) => (
        <li key={c.id}>
          Зверніть увагу: для {c.label} — {c.issues.join('; ')}.
        </li>
      ))}
    </ul>
  )
}

function CategoryPickerModal({
  categories,
  currentName,
  onPick,
  onClose,
}: {
  categories: Category[]
  currentName: string
  onPick: (name: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  useEscapeKey(true, onClose)

  const byParent = useMemo(() => {
    const map = new Map<string | null, Category[]>()
    for (const c of categories) {
      const list = map.get(c.parentId) ?? []
      list.push(c)
      map.set(c.parentId, list)
    }
    for (const [, list] of map) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk'))
    return map
  }, [categories])

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c.id, c.name)
    return m
  }, [categories])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(s))
  }, [categories, q])

  const roots = byParent.get(null) ?? []

  function pathLabel(c: Category) {
    const parts: string[] = [c.name]
    let pid = c.parentId
    while (pid) {
      const parentName = nameById.get(pid)
      if (!parentName) break
      parts.unshift(parentName)
      pid = categories.find((x) => x.id === pid)?.parentId ?? null
    }
    return parts.join(' › ')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label="Категорія CRM"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius)] bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="font-semibold">Категорія CRM</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Свій довідник сайту — мапінги МП зберігаються в «Категорії»
            </p>
          </div>
          <button type="button" className="px-2 text-lg" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <div className="border-b border-[var(--border)] px-4 py-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук категорії…"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {q.trim() ? (
            <ul className="space-y-0.5">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-[var(--bg)] ${
                      currentName === c.name ? 'bg-[var(--bg)] font-medium' : ''
                    }`}
                    onClick={() => onPick(c.name)}
                  >
                    {pathLabel(c)}
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
                  Нічого не знайдено
                </li>
              ) : null}
            </ul>
          ) : (
            <ul className="space-y-1">
              {roots.map((root) => {
                const children = byParent.get(root.id) ?? []
                return (
                  <li key={root.id}>
                    <button
                      type="button"
                      className={`w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm font-medium hover:bg-[var(--bg)] ${
                        currentName === root.name ? 'bg-[var(--bg)]' : ''
                      }`}
                      onClick={() => onPick(root.name)}
                    >
                      {root.name}
                    </button>
                    {children.length ? (
                      <ul className="ml-3 border-l border-[var(--border)] pl-2">
                        {children.map((child) => (
                          <li key={child.id}>
                            <button
                              type="button"
                              className={`w-full rounded-[var(--radius)] px-3 py-1.5 text-left text-sm hover:bg-[var(--bg)] ${
                                currentName === child.name ? 'bg-[var(--bg)] font-medium' : ''
                              }`}
                              onClick={() => onPick(child.name)}
                            >
                              {child.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
