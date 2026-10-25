import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Product } from '@/api/client'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { money } from '@/lib/format'

/** Must match WireLabels / orders.channel CHECK (manual channels only). */
const CHANNELS = ['Instagram', 'Вручну', 'Сайт'] as const
const WAREHOUSES = ['Основний'] as const
const CARRIERS = ['Нова Пошта', 'Міст Експрес'] as const
const DELIVERY_TYPES = ['Відділення', 'Адреса', 'Поштомат'] as const
const DELIVERY_PAYERS = ['Отримувач', 'Відправник'] as const
const PAYMENTS = [
  'Оплачено',
  'Накладений платіж',
  'Під час отримання',
  'Карткою при отриманні',
] as const
const CREATE_STATUSES = ['Чернетка', 'Нове', 'Підтверджено'] as const

type CreateStatus = (typeof CREATE_STATUSES)[number]
/** price — unit price in грн; null until a product is chosen */
type Line = { key: string; sku: string; qty: number; price: number | null }

function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[var(--text-secondary)]">{label}</span>
        {hint ? <span className="text-xs text-[var(--text-secondary)]">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: readonly { id: T; label: string; hint?: string }[]
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-[var(--radius)] bg-[var(--bg)] p-1"
    >
      {options.map((opt) => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => onChange(opt.id)}
            className={`rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-white text-[var(--text)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function ProductPickerModal({
  products,
  channel,
  onPick,
  onClose,
}: {
  products: Product[]
  channel: string
  onPick: (sku: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  useEscapeKey(true, onClose)
  useBodyScrollLock(true)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return products
    return products.filter((p) => `${p.sku} ${p.name} ${p.barcode}`.toLowerCase().includes(s))
  }, [products, q])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/50 p-4"
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
        aria-label="Вибір товару"
        className="flex h-[min(80vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius)] bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="font-semibold">Оберіть товар</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Канал замовлення: {channel} · показано доступний залишок і базову ціну
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
        <div className="border-b border-[var(--border)] px-4 py-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук за назвою, артикулом або штрихкодом"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-modal-scroll>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-[var(--bg)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Товар</th>
                <th className="px-3 py-2 text-right font-medium">Ціна</th>
                <th className="px-3 py-2 text-right font-medium">Доступно</th>
                <th className="w-20 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.sku} className="border-t border-[var(--border)] hover:bg-[var(--bg)]/70">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.name || 'Без назви'}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {p.sku}
                      {p.category ? ` · ${p.category}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(p.price)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.available} шт.</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button type="button" className="h-8" onClick={() => onPick(p.sku)}>
                      Обрати
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                    Нічого не знайдено
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function CreateOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [section, setSection] = useState<'items' | 'delivery'>('items')
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('Instagram')
  const [warehouse, setWarehouse] = useState<(typeof WAREHOUSES)[number]>('Основний')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [phone, setPhone] = useState('')
  const [payment, setPayment] = useState<(typeof PAYMENTS)[number]>('Під час отримання')
  const [orderStatus, setOrderStatus] = useState<CreateStatus>('Чернетка')
  const [comment, setComment] = useState('')
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>('Нова Пошта')
  const [deliveryType, setDeliveryType] = useState<(typeof DELIVERY_TYPES)[number]>('Відділення')
  const [deliveryCity, setDeliveryCity] = useState('')
  const [deliveryDetail, setDeliveryDetail] = useState('')
  const [deliveryHouse, setDeliveryHouse] = useState('')
  const [deliveryFlat, setDeliveryFlat] = useState('')
  const [deliveryPayer, setDeliveryPayer] =
    useState<(typeof DELIVERY_PAYERS)[number]>('Отримувач')
  const [lines, setLines] = useState<Line[]>([{ key: 'line-1', sku: '', qty: 1, price: null }])
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api
      .getProducts()
      .then((list) => {
        if (!cancelled) {
          setProducts(list.filter((p) => p.status === 'Активний' && p.available > 0))
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не вдалося завантажити товари')
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEscapeKey(true, pickingFor ? () => setPickingFor(null) : onClose)
  useBodyScrollLock(true)

  const customerName = [lastName, firstName, middleName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')

  const isAddress = deliveryType === 'Адреса'
  const detailPlaceholder =
    deliveryType === 'Адреса'
      ? 'Вулиця (без будинку)'
      : deliveryType === 'Поштомат'
        ? 'Номер поштомату, напр. 4501'
        : 'Номер відділення, напр. 25'

  const detailLabel =
    deliveryType === 'Адреса' ? 'Вулиця' : deliveryType === 'Поштомат' ? 'Поштомат' : 'Відділення'

  const lineTotal = lines.reduce((sum, line) => {
    if (!line.sku || line.price == null) return sum
    return sum + line.price * Math.max(0, line.qty || 0)
  }, 0)

  const qtyBySku = lines.reduce((map, line) => {
    if (!line.sku) return map
    map.set(line.sku, (map.get(line.sku) ?? 0) + Math.max(0, line.qty || 0))
    return map
  }, new Map<string, number>())

  const stockOk = [...qtyBySku.entries()].every(([sku, qty]) => {
    const p = products.find((x) => x.sku === sku)
    return Boolean(p && qty <= p.available)
  })
  const filledLines = lines.filter((l) => l.sku)
  const itemsValid =
    filledLines.length > 0 &&
    filledLines.every(
      (line) => line.qty >= 1 && line.price != null && line.price >= 0 && Number.isFinite(line.price),
    ) &&
    (orderStatus === 'Чернетка' || stockOk)

  const phoneOk = /^\+?380\d{9}$/.test(phone.replace(/[\s()-]/g, ''))
  const customerOk = Boolean(lastName.trim() && firstName.trim() && phone.trim())
  const canSubmit = customerOk && itemsValid && !saving

  const statusHint =
    orderStatus === 'Чернетка'
      ? 'Без резерву залишку — можна доробити пізніше'
      : orderStatus === 'Нове'
        ? 'Резерв залишку, чекає підтвердження'
        : 'Одразу «До відправлення» з резервом'

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function addLine() {
    setLines((prev) => [...prev, { key: `line-${Date.now()}`, sku: '', qty: 1, price: null }])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)))
  }

  async function submit() {
    try {
      setSaving(true)
      setError(null)
      const addressParts = [
        deliveryDetail.trim() || null,
        isAddress && deliveryHouse.trim() ? `буд. ${deliveryHouse.trim()}` : null,
        isAddress && deliveryFlat.trim() ? `кв. ${deliveryFlat.trim()}` : null,
      ].filter(Boolean)
      const order = await api.createOrder({
        channel,
        warehouse,
        customerName,
        customerPhone: phone.trim() || undefined,
        city: deliveryCity.trim() || undefined,
        delivery: carrier,
        deliveryType,
        deliveryAddress: addressParts.length ? addressParts.join(', ') : undefined,
        deliveryPayer,
        payment,
        status: orderStatus,
        comment: comment.trim() || undefined,
        items: filledLines.map((line) => ({
          sku: line.sku,
          qty: line.qty,
          price: line.price ?? undefined,
        })),
      })
      onCreated(order.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setSaving(false)
    }
  }

  const submitLabel =
    orderStatus === 'Чернетка'
      ? 'Зберегти чернетку'
      : orderStatus === 'Нове'
        ? 'Створити як нове'
        : 'Створити і підтвердити'

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center overflow-hidden bg-black/45 p-0 sm:items-center sm:p-4"
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
        aria-labelledby="create-order-title"
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-xl sm:h-[min(92vh,880px)] sm:rounded-[var(--radius)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="create-order-title" className="text-lg font-semibold tracking-tight">
              Нове замовлення
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{statusHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius)] px-2 py-1 text-lg leading-none text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            aria-label="Закрити"
          >
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_280px]">
          <div className="flex min-h-0 flex-col">
            <section className="shrink-0 space-y-3 border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Клієнт</h3>
                <span className="text-xs text-[var(--text-secondary)]">для ТТН: ПІБ + +380…</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Прізвище">
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Шевченко"
                    autoFocus
                    autoComplete="family-name"
                  />
                </Field>
                <Field label="Імʼя">
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Олена"
                    autoComplete="given-name"
                  />
                </Field>
                <Field label="По батькові" hint="необовʼязково">
                  <Input
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="Іванівна"
                    autoComplete="additional-name"
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Телефон" className="lg:col-span-1">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+380…"
                    inputMode="tel"
                    autoComplete="tel"
                    className={
                      phone.trim() && !phoneOk
                        ? 'border-[var(--warning)] focus:border-[var(--warning)]'
                        : ''
                    }
                  />
                  {phone.trim() && !phoneOk ? (
                    <span className="mt-1 block text-xs text-[var(--warning)]">
                      Краще формат +380XXXXXXXXX
                    </span>
                  ) : null}
                </Field>
                <Field label="Канал">
                  <Select
                    className="w-full"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as (typeof CHANNELS)[number])}
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Оплата">
                  <Select
                    className="w-full"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value as (typeof PAYMENTS)[number])}
                  >
                    {PAYMENTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </section>

            <div className="flex items-center gap-1 border-b border-[var(--border)] px-5">
              {(
                [
                  { id: 'items' as const, label: `Товари · ${filledLines.length}` },
                  {
                    id: 'delivery' as const,
                    label: deliveryCity.trim()
                      ? `Доставка · ${deliveryCity.trim()}`
                      : 'Доставка',
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSection(t.id)}
                  className={`relative -mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                    section === t.id
                      ? 'border-[var(--primary)] text-[var(--primary)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {section === 'items' ? (
                <div className="ml-auto py-1.5">
                  <Button type="button" variant="quiet" onClick={addLine}>
                    + Позиція
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4" data-modal-scroll>
              {section === 'items' ? (
                productsLoading ? (
                  <p className="text-sm text-[var(--text-secondary)]">Завантаження товарів…</p>
                ) : products.length === 0 ? (
                  <p className="text-sm text-[var(--error)]">Немає товарів у наявності</p>
                ) : (
                  <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--bg)] text-[var(--text-secondary)]">
                        <tr className="border-b border-[var(--border)]">
                          <th className="w-8 px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">Товар</th>
                          <th className="w-24 px-3 py-2 text-right font-medium">Ціна</th>
                          <th className="w-24 px-3 py-2 text-right font-medium">К-сть</th>
                          <th className="w-28 px-3 py-2 text-right font-medium">Сума</th>
                          <th className="w-10 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => {
                          const product = products.find((p) => p.sku === line.sku)
                          const needed = line.sku ? (qtyBySku.get(line.sku) ?? line.qty) : 0
                          const overstock = product ? needed > product.available : false
                          const unit = line.price ?? 0
                          const rowSum = unit * Math.max(0, line.qty || 0)
                          const priceOverridden =
                            product != null && line.price != null && line.price !== product.price
                          return (
                            <tr
                              key={line.key}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="px-3 py-2.5 align-middle text-[var(--text-secondary)]">
                                {index + 1}
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-left hover:border-[var(--primary)]"
                                    onClick={() => setPickingFor(line.key)}
                                  >
                                    {product ? (
                                      <>
                                        <div className="truncate font-medium">{product.name}</div>
                                        <div className="text-xs text-[var(--text-secondary)]">
                                          {product.sku}
                                        </div>
                                      </>
                                    ) : (
                                      <span className="text-[var(--text-secondary)]">
                                        Оберіть товар…
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className="h-9 w-9 shrink-0 rounded-[var(--radius)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)]"
                                    onClick={() => setPickingFor(line.key)}
                                    aria-label="Відкрити список товарів"
                                    title="Список товарів"
                                  >
                                    ⋯
                                  </button>
                                </div>
                                {product ? (
                                  <div
                                    className={`mt-1 text-xs ${
                                      overstock
                                        ? 'text-[var(--error)]'
                                        : 'text-[var(--text-secondary)]'
                                    }`}
                                  >
                                    {overstock
                                      ? `Доступно лише ${product.available} шт.`
                                      : `доступно ${product.available} шт. · ${warehouse}`}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-right">
                                <Input
                                  className="ml-auto w-[5.5rem] px-2 text-right tabular-nums"
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={line.price ?? ''}
                                  disabled={!line.sku}
                                  title={
                                    product
                                      ? `Каталог: ${money(product.price)}`
                                      : undefined
                                  }
                                  onChange={(e) => {
                                    const raw = e.target.value
                                    if (raw === '') {
                                      updateLine(line.key, { price: null })
                                      return
                                    }
                                    const n = Number(raw)
                                    updateLine(line.key, {
                                      price: Number.isFinite(n) ? Math.max(0, n) : line.price,
                                    })
                                  }}
                                />
                                {priceOverridden ? (
                                  <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                                    каталог {money(product.price)}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <Input
                                  className="ml-auto w-16 px-2 text-right"
                                  type="number"
                                  min={1}
                                  max={product?.available}
                                  value={line.qty}
                                  disabled={!line.sku}
                                  onChange={(e) =>
                                    updateLine(line.key, {
                                      qty: Math.max(1, Number(e.target.value) || 1),
                                    })
                                  }
                                />
                              </td>
                              <td className="px-3 py-2.5 align-middle text-right font-medium tabular-nums">
                                {line.sku && line.price != null ? money(rowSum) : '—'}
                              </td>
                              <td className="px-2 py-2.5 align-middle text-right">
                                <button
                                  type="button"
                                  className="h-8 w-8 rounded-[var(--radius)] text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--error)] disabled:opacity-40"
                                  disabled={lines.length <= 1}
                                  onClick={() => removeLine(line.key)}
                                  aria-label="Прибрати позицію"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="mx-auto max-w-2xl space-y-4">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Місто й адреса доставки — окремо від контактів клієнта: куди відправляємо саме
                    це замовлення.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Служба">
                      <Select
                        className="w-full"
                        value={carrier}
                        onChange={(e) => setCarrier(e.target.value as (typeof CARRIERS)[number])}
                      >
                        {CARRIERS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Платник">
                      <Select
                        className="w-full"
                        value={deliveryPayer}
                        onChange={(e) =>
                          setDeliveryPayer(e.target.value as (typeof DELIVERY_PAYERS)[number])
                        }
                      >
                        {DELIVERY_PAYERS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Місто доставки">
                    <Input
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder="Київ"
                    />
                  </Field>

                  <div>
                    <div className="mb-1 text-sm text-[var(--text-secondary)]">Тип</div>
                    <Segmented
                      ariaLabel="Тип доставки"
                      value={deliveryType}
                      onChange={setDeliveryType}
                      options={DELIVERY_TYPES.map((t) => ({ id: t, label: t }))}
                    />
                  </div>

                  <div
                    className={`grid gap-3 ${isAddress ? 'sm:grid-cols-[1fr_5.5rem_5.5rem]' : ''}`}
                  >
                    <Field label={detailLabel}>
                      <Input
                        value={deliveryDetail}
                        onChange={(e) => setDeliveryDetail(e.target.value)}
                        placeholder={detailPlaceholder}
                      />
                    </Field>
                    {isAddress ? (
                      <>
                        <Field label="Буд.">
                          <Input
                            value={deliveryHouse}
                            onChange={(e) => setDeliveryHouse(e.target.value)}
                            placeholder="12"
                          />
                        </Field>
                        <Field label="Кв.">
                          <Input
                            value={deliveryFlat}
                            onChange={(e) => setDeliveryFlat(e.target.value)}
                            placeholder="45"
                          />
                        </Field>
                      </>
                    ) : null}
                  </div>

                  <Field label="Склад відвантаження">
                    <Select
                      className="w-full"
                      value={warehouse}
                      onChange={(e) =>
                        setWarehouse(e.target.value as (typeof WAREHOUSES)[number])
                      }
                    >
                      {WAREHOUSES.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Коментар" hint="для себе / комплектації">
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Передзвонити перед відправкою…"
                      rows={2}
                      className="min-h-[4.5rem]"
                    />
                  </Field>

                  {payment === 'Накладений платіж' ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      COD піде в ТТН {carrier} при створенні накладної.
                    </p>
                  ) : null}
                </div>
              )}

              {error ? <p className="mt-3 text-sm text-[var(--error)]">{error}</p> : null}
            </div>
          </div>

          <aside className="flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--bg)]/60 lg:border-t-0 lg:border-l">
            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5" data-modal-scroll>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  Разом
                </div>
                <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                  {money(lineTotal)}
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {filledLines.length}{' '}
                  {filledLines.length === 1
                    ? 'позиція'
                    : filledLines.length < 5
                      ? 'позиції'
                      : 'позицій'}
                </p>
              </div>

              <div>
                <div className="mb-1.5 text-sm text-[var(--text-secondary)]">Статус створення</div>
                <Segmented
                  ariaLabel="Статус замовлення"
                  value={orderStatus}
                  onChange={setOrderStatus}
                  options={CREATE_STATUSES.map((s) => ({
                    id: s,
                    label: s,
                  }))}
                />
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Клієнт</dt>
                  <dd className="truncate text-right font-medium">{customerName || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Канал</dt>
                  <dd className="font-medium">{channel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Доставка</dt>
                  <dd className="max-w-[9rem] truncate text-right font-medium">
                    {[carrier, deliveryCity.trim() || null, deliveryType]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </div>
              </dl>

              {!itemsValid ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  {filledLines.length === 0
                    ? 'Додайте хоча б один товар через «⋯».'
                    : !stockOk && orderStatus !== 'Чернетка'
                      ? `Недостатньо залишку для статусу «${orderStatus}».`
                      : null}
                </p>
              ) : null}
              {!customerOk ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  Заповніть прізвище, імʼя та телефон.
                </p>
              ) : null}
            </div>

            <div className="shrink-0 space-y-2 border-t border-[var(--border)] bg-white px-5 py-4">
              <Button className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
                {saving ? 'Збереження…' : submitLabel}
              </Button>
              <Button className="w-full" variant="secondary" onClick={onClose}>
                Скасувати
              </Button>
            </div>
          </aside>
        </div>
      </div>

      {pickingFor ? (
        <ProductPickerModal
          products={products}
          channel={channel}
          onClose={() => setPickingFor(null)}
          onPick={(sku) => {
            const p = products.find((x) => x.sku === sku)
            updateLine(pickingFor, { sku, price: p?.price ?? 0 })
            setPickingFor(null)
          }}
        />
      ) : null}
    </div>
  )
}
