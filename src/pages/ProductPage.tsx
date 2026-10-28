import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import {
  api,
  isBrowserMock,
  productImageSrc,
  type Category,
  type Product,
  type ProductHistoryItem,
  type ProductImage,
} from '@/api/client'
import { navBackFrom } from '@/lib/navBack'
import { StockEditDrawer } from '@/components/StockEditDrawer'
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
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { formatDateTime, money } from '@/lib/format'
import {
  checkDescriptionForMarketplaces,
  checkNameForMarketplaces,
  DESCRIPTION_RULES,
  NAME_RULES,
  type FieldCheck,
} from '@/lib/marketplaceText'
import {
  REQUIRED_FIELDS,
  checkRequiredFields,
  missingRequiredLabels,
} from '@/lib/productRequired'
import { translateUkToRu } from '@/lib/translate'

const tabs = ['Основне', 'Атрибути', 'Ціни і наявність', 'Маркетплейси', 'Історія'] as const
type LangTab = 'ua' | 'ru'

export function ProductPage() {
  const { sku: skuParam = '' } = useParams()
  const location = useLocation()
  const back = navBackFrom(location.state, '/products')
  const sku = decodeURIComponent(skuParam)
  const [product, setProduct] = useState<Product | null>(null)
  const [draft, setDraft] = useState<Partial<Product>>({})
  const [tab, setTab] = useState<(typeof tabs)[number]>('Основне')
  const [langTab, setLangTab] = useState<LangTab>('ua')
  const [history, setHistory] = useState<ProductHistoryItem[]>([])
  const [historyFilter, setHistoryFilter] = useState('Усі')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [crmCategories, setCrmCategories] = useState<Category[]>([])
  const [pickingCategory, setPickingCategory] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
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

  const viewNameUa = draft.name ?? product?.name ?? ''
  const viewNameRu = draft.nameRu ?? product?.nameRu ?? ''
  const viewDescriptionUa = draft.description ?? product?.description ?? ''
  const viewDescriptionRu = draft.descriptionRu ?? product?.descriptionRu ?? ''
  const viewName = langTab === 'ua' ? viewNameUa : viewNameRu
  const viewDescription = langTab === 'ua' ? viewDescriptionUa : viewDescriptionRu
  const nameChecks = useMemo(() => checkNameForMarketplaces(viewName), [viewName])
  const descriptionChecks = useMemo(
    () => checkDescriptionForMarketplaces(viewDescription),
    [viewDescription],
  )
  const nameMax = Math.max(...Object.values(NAME_RULES).map((r) => r.max))
  const descriptionMax = Math.max(...Object.values(DESCRIPTION_RULES).map((r) => r.max))

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!product) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  const view: Product = {
    ...product,
    nameRu: product.nameRu ?? '',
    descriptionRu: product.descriptionRu ?? '',
    countryRu: product.countryRu ?? '',
    conditionRu: product.conditionRu ?? '',
    colorRu: product.colorRu ?? '',
    ageGroupRu: product.ageGroupRu ?? '',
    materialRu: product.materialRu ?? '',
    typeRu: product.typeRu ?? '',
    seriesRu: product.seriesRu ?? '',
    ...draft,
  }

  const requiredFills = checkRequiredFields(view)
  const missingRequired = missingRequiredLabels(requiredFills)

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

  async function addImage(file: File) {
    if (!product) return
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      const img = await api.uploadProductImage(product.sku, file)
      setProduct((p) =>
        p ? { ...p, images: [...(p.images ?? []), img] } : p,
      )
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Не вдалося завантажити')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removeImage(id: number) {
    if (!product) return
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      await api.deleteProductImage(product.sku, id)
      setProduct((p) =>
        p
          ? {
              ...p,
              images: (p.images ?? [])
                .filter((img) => img.id !== id)
                .map((img, position) => ({ ...img, position })),
            }
          : p,
      )
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Не вдалося видалити')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function moveImage(index: number, delta: number) {
    if (!product) return
    const images = [...(product.images ?? [])]
    const target = index + delta
    if (target < 0 || target >= images.length) return
    const [item] = images.splice(index, 1)
    images.splice(target, 0, item)
    const orderedIds = images.map((img) => img.id)
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      const next = await api.reorderProductImages(product.sku, orderedIds)
      setProduct((p) => (p ? { ...p, images: next } : p))
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Не вдалося змінити порядок')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function autoTranslateUaToRu() {
    setTranslateError(null)
    const v = { ...product!, ...draft }
    const pairs: { ua: string; key: keyof Product }[] = [
      { ua: v.name ?? '', key: 'nameRu' },
      { ua: v.description ?? '', key: 'descriptionRu' },
      { ua: v.country ?? '', key: 'countryRu' },
      { ua: v.condition ?? '', key: 'conditionRu' },
      { ua: v.color ?? '', key: 'colorRu' },
      { ua: v.ageGroup ?? '', key: 'ageGroupRu' },
      { ua: v.material ?? '', key: 'materialRu' },
      { ua: v.type ?? '', key: 'typeRu' },
      { ua: v.series ?? '', key: 'seriesRu' },
    ]
    const toDo = pairs.filter((p) => p.ua.trim())
    if (toDo.length === 0) {
      setTranslateError('Немає українських полів для перекладу. Заповніть UA спочатку.')
      return
    }
    setTranslating(true)
    try {
      const results = await Promise.all(
        toDo.map(async ({ ua, key }) => {
          const ru = await translateUkToRu(ua)
          return [key, ru] as const
        }),
      )
      setDraft((d) => {
        const next = { ...d }
        for (const [key, ru] of results) {
          ;(next as Record<string, string>)[key] = ru
        }
        return next
      })
      setLangTab('ru')
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : 'Помилка перекладу')
    } finally {
      setTranslating(false)
    }
  }

  const prices = product.marketplacePrices
  const filteredHistory =
    historyFilter === 'Усі' ? history : history.filter((h) => h.kind === historyFilter)

  return (
    <div>
      <PageHeader
        backTo={back.to}
        backLabel={back.label}
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
              <LangBar
                langTab={langTab}
                translating={translating}
                translateError={translateError}
                hintUa="Заповніть українською; країна і тексти теж підуть у автопереклад на RU."
                hintRu="Перекладає назву, опис, країну та текстові атрибути. «Україна» → «Украина» з глосарія."
                onLang={(id) => {
                  setLangTab(id)
                  setTranslateError(null)
                }}
                onTranslate={() => void autoTranslateUaToRu()}
              />

              <label className="block text-sm">
                <div className="mb-1 flex justify-between text-[var(--text-secondary)]">
                  <span>
                    Назва ({langTab === 'ua' ? 'UA' : 'RU'}){' '}
                    <span className="text-[var(--error)]" title="Обовʼязково для майданчиків">
                      *
                    </span>
                  </span>
                  <span>
                    {viewName.length} / {nameMax}
                  </span>
                </div>
                <Input
                  value={viewName}
                  onChange={(e) =>
                    setField(langTab === 'ua' ? 'name' : 'nameRu', e.target.value)
                  }
                  maxLength={nameMax}
                  placeholder={
                    langTab === 'ua'
                      ? 'Українська назва для вітрини та фідів'
                      : 'Російська назва (Rozetka / Prom)'
                  }
                />
                <MarketplaceIssues checks={nameChecks} />
              </label>
              <label className="mt-4 block text-sm">
                <div className="mb-1 flex justify-between text-[var(--text-secondary)]">
                  <span>
                    Опис ({langTab === 'ua' ? 'UA' : 'RU'}){' '}
                    <span className="text-[var(--error)]">*</span>
                  </span>
                  <span>
                    {viewDescription.length} / {descriptionMax}
                  </span>
                </div>
                <Textarea
                  value={viewDescription}
                  onChange={(e) =>
                    setField(
                      langTab === 'ua' ? 'description' : 'descriptionRu',
                      e.target.value,
                    )
                  }
                  maxLength={descriptionMax}
                  placeholder={
                    langTab === 'ua'
                      ? 'HTML: <p>, <b>, <ul><li>, таблиці…'
                      : 'Той самий формат, російською'
                  }
                />
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Допустимі теги як у Epicentr: абзаци, жирний, списки, таблиці. Інше не
                  передається.
                </p>
                <MarketplaceIssues checks={descriptionChecks} />
              </label>
              <div className="mt-4">
                <div className="mb-2 text-sm text-[var(--text-secondary)]">
                  Фото <span className="text-[var(--error)]">*</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(view.images ?? []).map((img, index) => (
                    <div
                      key={img.id}
                      className="group relative h-20 w-20 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"
                    >
                      <button
                        type="button"
                        className="h-full w-full cursor-zoom-in"
                        title="Переглянути"
                        onClick={() => setPreviewIndex(index)}
                      >
                        <img
                          src={productImageSrc(img.url)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                      {index === 0 ? (
                        <span className="pointer-events-none absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px]">
                          Головне
                        </span>
                      ) : null}
                      <div className="absolute inset-x-0 bottom-0 flex justify-between gap-0.5 bg-black/55 p-0.5 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          disabled={photoBusy || index === 0}
                          className="flex-1 rounded text-[10px] text-white disabled:opacity-40"
                          title="Ліворуч"
                          onClick={(e) => {
                            e.stopPropagation()
                            void moveImage(index, -1)
                          }}
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          disabled={photoBusy}
                          className="flex-1 rounded text-[10px] text-white"
                          title="Видалити"
                          onClick={(e) => {
                            e.stopPropagation()
                            void removeImage(img.id)
                          }}
                        >
                          ✕
                        </button>
                        <button
                          type="button"
                          disabled={photoBusy || index >= (view.images?.length ?? 0) - 1}
                          className="flex-1 rounded text-[10px] text-white disabled:opacity-40"
                          title="Праворуч"
                          onClick={(e) => {
                            e.stopPropagation()
                            void moveImage(index, 1)
                          }}
                        >
                          →
                        </button>
                      </div>
                    </div>
                  ))}
                  {(view.images?.length ?? 0) < 15 ? (
                    <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-[var(--border)] text-xs text-[var(--primary)] hover:border-[var(--primary)]">
                      {photoBusy ? '…' : 'Додати фото'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={photoBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) void addImage(file)
                        }}
                      />
                    </label>
                  ) : null}
                </div>
                {photoError ? (
                  <p className="mt-1 text-xs text-[var(--error)]">{photoError}</p>
                ) : null}
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Мін. 1 фото (білий фон). JPEG/PNG/WebP до 10 MB. Rozetka до 15, Prom до 10.
                  {isBrowserMock
                    ? ' У демо Pages фото лише в браузері; локально — npm run dev:java.'
                    : null}
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Артикул" required>
                  <Input value={product.sku} disabled />
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    На RZ/EC передається без дефіса (`TM10018`).
                  </div>
                </Field>
                <Field label="Категорія CRM" required>
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
                <Field label="Бренд" required>
                  <Input
                    value={view.brand}
                    onChange={(e) => setField('brand', e.target.value)}
                    placeholder="LEGO або «Без бренду»"
                  />
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    Обовʼязково для Rozetka та Epicentr.
                  </div>
                </Field>
                <Field label="Модель">
                  <Input value={view.model} onChange={(e) => setField('model', e.target.value)} />
                </Field>
                <Field label="Штрихкод">
                  <Input value={view.barcode} onChange={(e) => setField('barcode', e.target.value)} />
                </Field>
                <Field
                  label={
                    langTab === 'ua' ? 'Країна-виробник (UA)' : 'Країна-виробник (RU)'
                  }
                >
                  <Input
                    value={langTab === 'ua' ? view.country : (view.countryRu ?? '')}
                    onChange={(e) =>
                      setField(langTab === 'ua' ? 'country' : 'countryRu', e.target.value)
                    }
                    placeholder={langTab === 'ua' ? 'Україна' : 'Украина'}
                  />
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {langTab === 'ua'
                      ? 'На RU буде «Украина» після автоперекладу / глосарія.'
                      : 'Обовʼязково російською для RU-вітрини (не плутати з UA «Україна»).'}
                  </div>
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
                Різний колір — окремий артикул через Дублювати. Текстові значення — UA/RU (як
                назва/опис); числа спільні.
              </p>
              <div className="mt-3">
                <LangBar
                  langTab={langTab}
                  translating={translating}
                  translateError={translateError}
                  hintUa="Заповніть атрибути українською."
                  hintRu="Ті самі атрибути російською. Кнопка перекладає з UA (і країну/назву/опис теж)."
                  onLang={(id) => {
                    setLangTab(id)
                    setTranslateError(null)
                  }}
                  onTranslate={() => void autoTranslateUaToRu()}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label={langTab === 'ua' ? 'Стан (UA)' : 'Стан (RU)'}>
                  <Input
                    value={
                      langTab === 'ua' ? (view.condition ?? '') : (view.conditionRu ?? '')
                    }
                    onChange={(e) =>
                      setField(langTab === 'ua' ? 'condition' : 'conditionRu', e.target.value)
                    }
                    placeholder={langTab === 'ua' ? 'Новий' : 'Новый'}
                  />
                </Field>
                <Field label={langTab === 'ua' ? 'Колір (UA)' : 'Колір (RU)'}>
                  <Input
                    value={langTab === 'ua' ? (view.color ?? '') : (view.colorRu ?? '')}
                    onChange={(e) =>
                      setField(langTab === 'ua' ? 'color' : 'colorRu', e.target.value)
                    }
                  />
                </Field>
                <Field label={langTab === 'ua' ? 'Вікова група (UA)' : 'Вікова група (RU)'}>
                  <Input
                    value={
                      langTab === 'ua' ? (view.ageGroup ?? '') : (view.ageGroupRu ?? '')
                    }
                    onChange={(e) =>
                      setField(langTab === 'ua' ? 'ageGroup' : 'ageGroupRu', e.target.value)
                    }
                    placeholder={langTab === 'ua' ? '6–12 років' : '6–12 лет'}
                  />
                </Field>
                <Field label={langTab === 'ua' ? 'Матеріал (UA)' : 'Матеріал (RU)'}>
                  <Input
                    value={
                      langTab === 'ua' ? (view.material ?? '') : (view.materialRu ?? '')
                    }
                    onChange={(e) =>
                      setField(langTab === 'ua' ? 'material' : 'materialRu', e.target.value)
                    }
                  />
                </Field>
                <Field label={langTab === 'ua' ? 'Тип (UA)' : 'Тип (RU)'}>
                  <Input
                    value={langTab === 'ua' ? (view.type ?? '') : (view.typeRu ?? '')}
                    onChange={(e) =>
                      setField(langTab === 'ua' ? 'type' : 'typeRu', e.target.value)
                    }
                  />
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
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    Число — спільне для UA і RU (не перекладається).
                  </div>
                </Field>
                <Field label={langTab === 'ua' ? 'Серія (UA)' : 'Серія (RU)'}>
                  <Input
                    value={langTab === 'ua' ? (view.series ?? '') : (view.seriesRu ?? '')}
                    onChange={(e) =>
                      setField(langTab === 'ua' ? 'series' : 'seriesRu', e.target.value)
                    }
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
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                RU для атрибутів не блокує синк сам по собі (обовʼязкові на RU лише назва й
                опис на Rozetka/Prom). Але для Epicentr text-param і RU-вітрини краще
                заповнити.
              </p>
            </Panel>
          ) : null}

          {tab === 'Ціни і наявність' ? (
            <>
              <Panel title="Базова ціна">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Ціна, грн" required>
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
                <Button
                  variant="quiet"
                  className="mt-2 h-8 px-2"
                  onClick={() => setStockOpen(true)}
                >
                  Змінити залишок
                </Button>
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
                    {enabled && missingRequired.length > 0 ? (
                      <p className="mt-2 text-sm text-[var(--warning)]">
                        Не заповнено для синхронізації: {missingRequired.join(', ')}.
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
            <Button
              variant="quiet"
              className="mt-3 h-8 px-2"
              onClick={() => setStockOpen(true)}
            >
              Змінити залишок
            </Button>
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
          <Panel title="Готовність до вивантаження">
            <p className="mb-2 text-xs text-[var(--text-secondary)]">
              Обовʼязкові поля = ті, що required хоча б на одному з Rozetka / Prom / Epicentr.
              Чернетку можна зберегти порожньою.
            </p>
            <ul className="space-y-1.5 text-sm">
              {REQUIRED_FIELDS.map((def) => {
                const fill = requiredFills.find((f) => f.id === def.id)
                const ok = fill?.ok ?? false
                return (
                  <li key={def.id} className="flex items-start gap-2">
                    <span
                      className={ok ? 'text-[var(--success)]' : 'text-[var(--warning)]'}
                      aria-hidden
                    >
                      {ok ? '✓' : '!'}
                    </span>
                    <span>
                      <span className={ok ? '' : 'text-[var(--warning)]'}>{def.label}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--text-secondary)]">
                        {def.marketplaces.join(', ')}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            {missingRequired.length > 0 && product.status !== 'Чернетка' ? (
              <p className="mt-3 text-xs text-[var(--warning)]">
                Не заповнено: {missingRequired.join(', ')}. Синк на майданчики буде
                заблоковано, доки поля порожні.
              </p>
            ) : null}
          </Panel>
        </div>
      </div>

      {previewIndex != null && (view.images?.length ?? 0) > 0 ? (
        <PhotoLightbox
          images={view.images ?? []}
          index={Math.min(previewIndex, (view.images?.length ?? 1) - 1)}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      ) : null}

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

      {stockOpen ? (
        <StockEditDrawer
          products={[product]}
          initialSku={product.sku}
          onClose={() => setStockOpen(false)}
          onSaved={() => load()}
        />
      ) : null}
    </div>
  )
}

function LangBar({
  langTab,
  translating,
  translateError,
  hintUa,
  hintRu,
  onLang,
  onTranslate,
}: {
  langTab: LangTab
  translating: boolean
  translateError: string | null
  hintUa: string
  hintRu: string
  onLang: (id: LangTab) => void
  onTranslate: () => void
}) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex rounded-[var(--radius)] border border-[var(--border)] p-0.5"
          role="tablist"
          aria-label="Мова контенту"
        >
          {(
            [
              { id: 'ua' as const, label: 'UA' },
              { id: 'ru' as const, label: 'RU' },
            ] as const
          ).map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={langTab === l.id}
              onClick={() => onLang(l.id)}
              className={`rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm font-medium ${
                langTab === l.id
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg)]'
              }`}
            >
              {l.label}
              {l.id === 'ua' ? (
                <span className="ml-1 text-[10px] opacity-80">основна</span>
              ) : null}
            </button>
          ))}
        </div>
        {langTab === 'ru' ? (
          <Button
            variant="secondary"
            className="h-8"
            disabled={translating}
            onClick={onTranslate}
          >
            {translating ? 'Перекладаємо…' : 'Автоматично перекласти з UA'}
          </Button>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">{hintUa}</p>
        )}
      </div>
      {langTab === 'ru' ? (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{hintRu}</p>
      ) : null}
      {translateError ? (
        <p className="mt-2 text-sm text-[var(--error)]">{translateError}</p>
      ) : null}
    </div>
  )
}

function Field({
  label,
  children,
  required,
}: {
  label: ReactNode
  children: ReactNode
  required?: boolean
}) {
  return (
    <div className="block text-sm">
      <div className="mb-1 text-[var(--text-secondary)]">
        {label}
        {required ? <span className="text-[var(--error)]"> *</span> : null}
      </div>
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

function PhotoLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: ProductImage[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const total = images.length
  const current = images[index]
  const canPrev = index > 0
  const canNext = index < total - 1

  useEscapeKey(true, onClose)
  useBodyScrollLock(true)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && canPrev) {
        e.preventDefault()
        onIndexChange(index - 1)
      } else if (e.key === 'ArrowRight' && canNext) {
        e.preventDefault()
        onIndexChange(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, canPrev, canNext, onIndexChange])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col items-center gap-3"
        role="dialog"
        aria-modal="true"
        aria-label="Перегляд фото"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between text-sm text-white/90">
          <span>
            {index + 1} / {total}
            {index === 0 ? ' · Головне' : ''}
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 hover:bg-white/10"
            onClick={onClose}
            aria-label="Закрити"
          >
            ✕
          </button>
        </div>

        <div className="relative flex w-full items-center justify-center">
          {canPrev ? (
            <button
              type="button"
              className="absolute left-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70 sm:left-2"
              aria-label="Попереднє фото"
              onClick={() => onIndexChange(index - 1)}
            >
              ‹
            </button>
          ) : null}
          <img
            src={productImageSrc(current.url)}
            alt=""
            className="max-h-[75vh] max-w-full rounded-md object-contain shadow-lg"
          />
          {canNext ? (
            <button
              type="button"
              className="absolute right-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70 sm:right-2"
              aria-label="Наступне фото"
              onClick={() => onIndexChange(index + 1)}
            >
              ›
            </button>
          ) : null}
        </div>
      </div>
    </div>
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
  useBodyScrollLock(true)

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
        aria-label="Категорія CRM"
        className="flex h-[min(80vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius)] bg-white shadow-xl"
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" data-modal-scroll>
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
