import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  api,
  type PricePreview,
  type PriceRule,
  type PricesFile,
  type Product,
} from '@/api/client'
import { Button, Input, PageHeader, Panel, Select, StatusChip } from '@/components/ui'
import { money } from '@/lib/format'

type Tab = 'all' | 'rozetka' | 'epicentr' | 'prom'

const emptyDraft = {
  marketplace: 'rozetka' as PriceRule['marketplace'],
  scope: 'default' as PriceRule['scope'],
  scopeValue: '' as string,
  kind: 'percent' as PriceRule['kind'],
  value: 10,
  rounding: 'up_10' as PriceRule['rounding'],
}

export function PricesPage() {
  const [data, setData] = useState<PricesFile | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [preview, setPreview] = useState<PricePreview | null>(null)
  const [saving, setSaving] = useState(false)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'all'

  async function load() {
    const [prices, list] = await Promise.all([api.getPrices(), api.getProducts()])
    setData(prices)
    setProducts(list)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!panelOpen) return
    const t = window.setTimeout(() => {
      void api
        .previewPriceRule({
          marketplace: draft.marketplace,
          scope: draft.scope,
          scopeValue: draft.scope === 'default' ? null : draft.scopeValue || null,
          scopeLabel: draft.scopeValue,
          kind: draft.kind,
          value: draft.kind === 'base' ? null : draft.value,
          rounding: draft.kind === 'base' || draft.kind === 'exact' ? 'none' : draft.rounding,
        })
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 200)
    return () => window.clearTimeout(t)
  }, [panelOpen, draft])

  const categories = useMemo(() => {
    return [...new Set(products.map((p) => p.category).filter(Boolean))].sort()
  }, [products])

  const filtered = useMemo(() => {
    if (!data) return []
    if (tab === 'all') return data.rules
    return data.rules.filter((r) => r.marketplace === tab)
  }, [data, tab])

  async function save() {
    setSaving(true)
    try {
      await api.createPriceRule({
        marketplace: draft.marketplace,
        scope: draft.scope,
        scopeValue: draft.scope === 'default' ? null : draft.scopeValue || null,
        scopeLabel: draft.scopeValue,
        kind: draft.kind,
        value: draft.kind === 'base' ? null : Number(draft.value),
        rounding: draft.kind === 'base' || draft.kind === 'exact' ? 'none' : draft.rounding,
      })
      await load()
      setPanelOpen(false)
      setDraft(emptyDraft)
      setPreview(null)
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return <div className="text-sm text-[var(--text-secondary)]">Завантаження…</div>
  }

  return (
    <div>
      <PageHeader
        title="Ціни"
        meta={`${data.meta.ruleCount} правил`}
        actions={
          <Button
            onClick={() => {
              setDraft(emptyDraft)
              setPanelOpen(true)
            }}
          >
            Додати правило
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            { id: 'all' as const, label: 'Усі' },
            { id: 'rozetka' as const, label: 'Rozetka' },
            { id: 'epicentr' as const, label: 'Epicentr' },
            { id: 'prom' as const, label: 'Prom' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams(t.id === 'all' ? {} : { tab: t.id })}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-[var(--primary)] text-white'
                : 'border border-[var(--border)] bg-white text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        Діє найточніше правило: товар → категорія → за замовчуванням.
      </p>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--bg)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium">Майданчик</th>
                <th className="px-3 py-2 font-medium">Де діє</th>
                <th className="px-3 py-2 font-medium">Правило</th>
                <th className="px-3 py-2 font-medium">Округлення</th>
                <th className="px-3 py-2 text-right font-medium">Товарів</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2.5">{r.marketplaceLabel}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.scopeLabel}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{r.scopeLevel}</div>
                  </td>
                  <td className="px-3 py-2.5">{r.ruleLabel}</td>
                  <td className="px-3 py-2.5">{r.roundingLabel}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.productCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Panel title="Пороги Rozetka">
          <p className="text-sm text-[var(--text-secondary)]">{data.meta.rozetkaThresholdNote}</p>
        </Panel>
      </div>

      {panelOpen ? (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l border-[var(--border)] bg-white shadow-lg">
          <header className="border-b border-[var(--border)] px-5 py-4 text-lg font-semibold">
            Нове правило
          </header>
          <div className="flex-1 space-y-4 overflow-auto p-5 text-sm">
            <label className="block">
              <span className="mb-1 block text-[var(--text-secondary)]">Майданчик</span>
              <Select
                className="w-full"
                value={draft.marketplace}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    marketplace: e.target.value as PriceRule['marketplace'],
                  }))
                }
              >
                <option value="rozetka">Rozetka</option>
                <option value="epicentr">Epicentr</option>
                <option value="prom">Prom</option>
              </Select>
            </label>

            <div>
              <div className="mb-1 text-[var(--text-secondary)]">Де діє</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {(
                  [
                    { id: 'default' as const, label: 'За замовчуванням' },
                    { id: 'category' as const, label: 'Категорія' },
                    { id: 'product' as const, label: 'Товар' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`rounded-md px-2.5 py-1.5 text-sm ${
                      draft.scope === s.id
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] bg-white'
                    }`}
                    onClick={() => setDraft((d) => ({ ...d, scope: s.id, scopeValue: '' }))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {draft.scope === 'category' ? (
                <Select
                  className="w-full"
                  value={draft.scopeValue}
                  onChange={(e) => setDraft((d) => ({ ...d, scopeValue: e.target.value }))}
                >
                  <option value="">Оберіть категорію</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : null}
              {draft.scope === 'product' ? (
                <Select
                  className="w-full"
                  value={draft.scopeValue}
                  onChange={(e) => setDraft((d) => ({ ...d, scopeValue: e.target.value }))}
                >
                  <option value="">Оберіть товар</option>
                  {products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.sku} · {p.name}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>

            <div>
              <div className="mb-1 text-[var(--text-secondary)]">Правило</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {(
                  [
                    { id: 'exact' as const, label: 'Точна ціна' },
                    { id: 'percent' as const, label: 'Вище на %' },
                    { id: 'amount' as const, label: 'Вище на суму' },
                    { id: 'base' as const, label: 'Як базова' },
                  ] as const
                ).map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className={`rounded-md px-2.5 py-1.5 text-sm ${
                      draft.kind === k.id
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] bg-white'
                    }`}
                    onClick={() => setDraft((d) => ({ ...d, kind: k.id }))}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              {draft.kind !== 'base' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-32"
                    value={draft.value}
                    onChange={(e) => setDraft((d) => ({ ...d, value: Number(e.target.value) }))}
                  />
                  <span className="text-[var(--text-secondary)]">
                    {draft.kind === 'percent' ? '%' : 'грн'}
                  </span>
                </div>
              ) : null}
            </div>

            {draft.kind === 'percent' || draft.kind === 'amount' ? (
              <label className="block">
                <span className="mb-1 block text-[var(--text-secondary)]">Округлення</span>
                <Select
                  className="w-full"
                  value={draft.rounding}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      rounding: e.target.value as PriceRule['rounding'],
                    }))
                  }
                >
                  <option value="up_10">Вгору до 10 грн</option>
                  <option value="none">Без округлення</option>
                </Select>
              </label>
            ) : null}

            <Panel title="Попередній перегляд">
              {preview ? (
                <div className="space-y-2 text-sm">
                  <div>Зміниться ціна {preview.count} товарів</div>
                  <div className="flex items-center gap-2">
                    <span>Стрибків понад поріг Rozetka:</span>
                    <StatusChip tone={preview.jumps === 0 ? 'success' : 'warning'}>
                      {preview.jumps}
                    </StatusChip>
                  </div>
                  {preview.examples[0] ? (
                    <div className="rounded-md bg-[var(--bg)] p-2 text-xs">
                      <div className="font-medium">
                        {preview.examples[0].name} · {preview.examples[0].sku}
                      </div>
                      <div className="mt-1 text-[var(--text-secondary)]">
                        {money(preview.examples[0].before)} → {money(preview.examples[0].after)}
                        <span className="ml-1">(база {money(preview.examples[0].base)})</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[var(--text-secondary)]">Немає товарів під це правило</div>
                  )}
                  {preview.count > 1 ? (
                    <div className="text-[var(--text-secondary)]">Показати всі {preview.count}</div>
                  ) : null}
                </div>
              ) : (
                <div className="text-[var(--text-secondary)]">Рахуємо…</div>
              )}
            </Panel>
          </div>
          <footer className="flex gap-2 border-t border-[var(--border)] p-4">
            <Button
              disabled={
                saving ||
                (draft.scope !== 'default' && !draft.scopeValue) ||
                (draft.kind !== 'base' && (draft.value == null || Number.isNaN(draft.value)))
              }
              onClick={() => void save()}
            >
              Зберегти правило
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPanelOpen(false)
                setPreview(null)
              }}
            >
              Скасувати
            </Button>
          </footer>
        </div>
      ) : null}
    </div>
  )
}
