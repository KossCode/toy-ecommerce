import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Product } from '@/api/client'
import { Button, Input, PageHeader, Panel, StatusChip, StockDot, Textarea, chipTone } from '@/components/ui'
import { money } from '@/lib/format'

const tabs = ['Основне', 'Атрибути', 'Ціни і наявність', 'Майданчики', 'Історія'] as const

export function ProductPage() {
  const { sku = '' } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [draft, setDraft] = useState<Partial<Product>>({})
  const [tab, setTab] = useState<(typeof tabs)[number]>('Основне')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = Object.keys(draft).length > 0

  async function load() {
    const p = await api.getProduct(sku)
    setProduct(p)
    setDraft({})
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Помилка'))
  }, [sku])

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!product) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  const view = { ...product, ...draft }

  function setField<K extends keyof Product>(key: K, value: Product[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

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
              {product.sku} · {product.brand || 'Не вказано бренд'} · {product.category} · змінено{' '}
              {product.updatedBy}
            </span>
          </span>
        }
        actions={
          <>
            <Button
              disabled={!dirty || saving}
              onClick={async () => {
                setSaving(true)
                try {
                  const next = await api.patchProduct(product.sku, draft)
                  setProduct(next)
                  setDraft({})
                } finally {
                  setSaving(false)
                }
              }}
            >
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

      {tab !== 'Основне' ? (
        <Panel>
          <p className="text-[var(--text-secondary)]">
            Вкладка «{tab}» — наступний крок (у макеті через edit_screens). Зараз доступна «Основне».
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Panel>
              <label className="block text-sm">
                <div className="mb-1 flex justify-between text-[var(--text-secondary)]">
                  <span>Назва</span>
                  <span>{(view.name ?? '').length} / 255</span>
                </div>
                <Input
                  value={view.name}
                  onChange={(e) => setField('name', e.target.value)}
                  maxLength={255}
                />
              </label>
              <label className="mt-4 block text-sm">
                <div className="mb-1 text-[var(--text-secondary)]">Опис</div>
                <Textarea
                  value={view.description}
                  onChange={(e) => setField('description', e.target.value)}
                />
                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                  Допустимі теги як у Epicentr: абзаци, жирний, списки, таблиці. Інше не передається.
                </div>
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
                    На RZ/EC передається як TM10018 (без дефіса).
                  </div>
                </Field>
                <Field label="Категорія">
                  <Input value={view.category} onChange={(e) => setField('category', e.target.value)} />
                </Field>
                <Field label="Бренд">
                  <Input value={view.brand} onChange={(e) => setField('brand', e.target.value)} />
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
            <Panel title="Майданчики">
              <ul className="space-y-2 text-sm">
                {Object.entries(product.channels).map(([key, status]) => (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <span className="capitalize">{key}</span>
                    <StatusChip tone={chipTone(status)}>{status}</StatusChip>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Деталі по каналах — вкладка «Майданчики». У списку товарів лише «Синхронізація»:{' '}
                {product.syncStatus}.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-[var(--text-secondary)]">{label}</div>
      {children}
    </label>
  )
}
