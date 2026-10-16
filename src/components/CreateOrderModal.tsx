import { useMemo, useState, type ReactNode } from 'react'
import { api, type Product } from '@/api/client'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { money } from '@/lib/format'

const CHANNELS = ['Instagram', 'Telegram', 'Viber', 'Телефон'] as const
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

export function CreateOrderModal({
  products,
  onClose,
  onCreated,
}: {
  products: Product[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('Instagram')
  const [warehouse, setWarehouse] = useState<(typeof WAREHOUSES)[number]>('Основний')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [payment, setPayment] = useState<(typeof PAYMENTS)[number]>('Під час отримання')
  const [orderStatus, setOrderStatus] = useState<CreateStatus>('Чернетка')
  const [comment, setComment] = useState('')
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>('Нова Пошта')
  const [deliveryType, setDeliveryType] = useState<(typeof DELIVERY_TYPES)[number]>('Відділення')
  const [deliveryDetail, setDeliveryDetail] = useState('')
  const [deliveryHouse, setDeliveryHouse] = useState('')
  const [deliveryFlat, setDeliveryFlat] = useState('')
  const [deliveryPayer, setDeliveryPayer] =
    useState<(typeof DELIVERY_PAYERS)[number]>('Отримувач')
  const [productQuery, setProductQuery] = useState('')
  const [lines, setLines] = useState<{ key: string; sku: string; qty: number }[]>([
    { key: 'line-1', sku: products[0]?.sku ?? '', qty: 1 },
  ])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEscapeKey(true, onClose)

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
    const p = products.find((x) => x.sku === line.sku)
    return sum + (p?.price ?? 0) * Math.max(0, line.qty || 0)
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
  const itemsValid =
    lines.length > 0 &&
    lines.every((line) => line.sku && line.qty >= 1) &&
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

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      `${p.sku} ${p.name} ${p.barcode}`.toLowerCase().includes(q),
    )
  }, [products, productQuery])

  function updateLine(key: string, patch: Partial<{ sku: string; qty: number }>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function addLine(sku?: string) {
    const used = new Set(lines.map((l) => l.sku))
    const next =
      (sku ? products.find((p) => p.sku === sku) : null) ??
      products.find((p) => !used.has(p.sku)) ??
      products[0]
    setLines((prev) => [
      ...prev,
      { key: `line-${Date.now()}`, sku: next?.sku ?? '', qty: 1 },
    ])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)))
  }

  async function submit() {
    try {
      setSaving(true)
      setError(null)
      const merged = new Map<string, number>()
      for (const line of lines) {
        merged.set(line.sku, (merged.get(line.sku) ?? 0) + line.qty)
      }
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
        city: city.trim() || undefined,
        delivery: carrier,
        deliveryType,
        deliveryAddress: addressParts.length ? addressParts.join(', ') : undefined,
        deliveryPayer,
        payment,
        status: orderStatus,
        comment: comment.trim() || undefined,
        items: [...merged.entries()].map(([sku, qty]) => ({ sku, qty })),
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
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
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
          <div className="min-h-0 overflow-y-auto px-5 py-5">
            <section className="space-y-4">
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Телефон" className="lg:col-span-2">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+380…"
                    inputMode="tel"
                    autoComplete="tel"
                    className={
                      phone.trim() && !phoneOk ? 'border-[var(--warning)] focus:border-[var(--warning)]' : ''
                    }
                  />
                  {phone.trim() && !phoneOk ? (
                    <span className="mt-1 block text-xs text-[var(--warning)]">
                      Краще формат +380XXXXXXXXX
                    </span>
                  ) : null}
                </Field>
                <Field label="Місто">
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Київ"
                    autoComplete="address-level2"
                  />
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
              </div>
            </section>

            <hr className="my-6 border-[var(--border)]" />

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Товари</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-8 w-48 text-sm"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Пошук артикула…"
                    aria-label="Пошук товару"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8"
                    disabled={products.length === 0}
                    onClick={() => addLine()}
                  >
                    + Позиція
                  </Button>
                </div>
              </div>

              {products.length === 0 ? (
                <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-sm text-[var(--error)]">
                  Немає товарів у наявності
                </p>
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
                        const needed = qtyBySku.get(line.sku) ?? line.qty
                        const overstock = product ? needed > product.available : false
                        const rowSum = (product?.price ?? 0) * Math.max(0, line.qty || 0)
                        const options =
                          product && !filteredProducts.some((p) => p.sku === product.sku)
                            ? [product, ...filteredProducts]
                            : filteredProducts.length
                              ? filteredProducts
                              : products
                        return (
                          <tr
                            key={line.key}
                            className="border-b border-[var(--border)] last:border-0"
                          >
                            <td className="px-3 py-2.5 align-middle text-[var(--text-secondary)]">
                              {index + 1}
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                              <Select
                                className="w-full max-w-md"
                                value={line.sku}
                                onChange={(e) => updateLine(line.key, { sku: e.target.value })}
                              >
                                {options.map((p) => (
                                  <option key={p.sku} value={p.sku}>
                                    {p.sku} · {p.name}
                                  </option>
                                ))}
                              </Select>
                              {product ? (
                                <div
                                  className={`mt-1 text-xs ${
                                    overstock
                                      ? 'text-[var(--error)]'
                                      : 'text-[var(--text-secondary)]'
                                  }`}
                                >
                                  {overstock
                                    ? `Доступно лише ${product.available} шт.${
                                        needed !== line.qty ? ` (разом у рядках ${needed})` : ''
                                      }`
                                    : `доступно ${product.available} шт. · ${warehouse}`}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-right tabular-nums">
                              {product ? money(product.price) : '—'}
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                              <Input
                                className="ml-auto w-16 px-2 text-right"
                                type="number"
                                min={1}
                                max={product?.available}
                                value={line.qty}
                                onChange={(e) =>
                                  updateLine(line.key, {
                                    qty: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2.5 align-middle text-right font-medium tabular-nums">
                              {money(rowSum)}
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
              )}

              {productQuery.trim() && filteredProducts.length > 0 && filteredProducts.length <= 6 ? (
                <div className="flex flex-wrap gap-1.5">
                  {filteredProducts.slice(0, 6).map((p) => (
                    <button
                      key={p.sku}
                      type="button"
                      onClick={() => {
                        addLine(p.sku)
                        setProductQuery('')
                      }}
                      className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      + {p.sku}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <hr className="my-6 border-[var(--border)]" />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Доставка</h3>
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

              <div>
                <div className="mb-1 text-sm text-[var(--text-secondary)]">Тип</div>
                <Segmented
                  ariaLabel="Тип доставки"
                  value={deliveryType}
                  onChange={setDeliveryType}
                  options={DELIVERY_TYPES.map((t) => ({ id: t, label: t }))}
                />
              </div>

              <div className={`grid gap-3 ${isAddress ? 'sm:grid-cols-[1fr_5.5rem_5.5rem]' : ''}`}>
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

              {payment === 'Накладений платіж' ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  COD піде в ТТН {carrier} при створенні накладної — сума = залишок по замовленню.
                </p>
              ) : null}
            </section>

            <hr className="my-6 border-[var(--border)]" />

            <section className="space-y-3 pb-2">
              <h3 className="text-sm font-semibold">Додатково</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Склад відвантаження">
                  <Select
                    className="w-full"
                    value={warehouse}
                    onChange={(e) => setWarehouse(e.target.value as (typeof WAREHOUSES)[number])}
                  >
                    {WAREHOUSES.map((w) => (
                      <option key={w} value={w}>
                        {w}
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
              <Field label="Коментар" hint="для себе / комплектації">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Передзвонити перед відправкою, подарункове пакування…"
                  rows={2}
                  className="min-h-[4.5rem]"
                />
              </Field>
            </section>

            {error ? <p className="mt-4 text-sm text-[var(--error)]">{error}</p> : null}
          </div>

          <aside className="flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--bg)]/60 lg:border-t-0 lg:border-l">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  Разом
                </div>
                <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                  {money(lineTotal)}
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {lines.length}{' '}
                  {lines.length === 1 ? 'позиція' : lines.length < 5 ? 'позиції' : 'позицій'}
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
                    hint:
                      s === 'Чернетка'
                        ? 'Без резерву'
                        : s === 'Нове'
                          ? 'З резервом'
                          : 'Підтверджено одразу',
                  }))}
                />
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Клієнт</dt>
                  <dd className="truncate text-right font-medium">
                    {customerName || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Канал</dt>
                  <dd className="font-medium">{channel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Склад</dt>
                  <dd className="font-medium">{warehouse}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Доставка</dt>
                  <dd className="max-w-[9rem] truncate text-right font-medium">
                    {[carrier, deliveryType, deliveryDetail.trim() || null]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Оплата</dt>
                  <dd className="max-w-[9rem] truncate text-right font-medium">{payment}</dd>
                </div>
              </dl>

              {!itemsValid && orderStatus !== 'Чернетка' && !stockOk ? (
                <p className="text-xs text-[var(--error)]">
                  Недостатньо залишку для статусу «{orderStatus}». Зменшіть кількість або збережіть
                  як чернетку.
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
    </div>
  )
}
