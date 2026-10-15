import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type OrderListItem, type Product } from '@/api/client'
import { BulkActionBar } from '@/components/BulkActionBar'
import { Button, Input, PageHeader, Panel, Select, StatusChip, chipTone } from '@/components/ui'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { formatDateTime, money } from '@/lib/format'

const CARRIERS = ['Нова Пошта', 'Міст Експрес'] as const
const DELIVERY_TYPES = ['Відділення', 'Адреса', 'Поштомат'] as const
const DELIVERY_PAYERS = ['Отримувач', 'Відправник'] as const
const PAYMENTS = [
  'Оплачено',
  'Накладений платіж',
  'Під час отримання',
  'Карткою при отриманні',
] as const

type Tab = 'all' | 'new' | 'ship' | 'sent' | 'cancelled'

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') as Tab) || 'all'

  async function load() {
    const [o, p] = await Promise.all([api.getOrders(), api.getProducts()])
    setOrders(o)
    setProducts(p)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (tab === 'new' && o.status !== 'Нове') return false
      if (tab === 'ship' && o.status !== 'Підтверджено') return false
      if (tab === 'sent' && o.status !== 'Відправлено') return false
      if (tab === 'cancelled' && o.status !== 'Скасовано') return false
      if (channel !== 'all' && o.channel !== channel) return false
      if (q) {
        const s = q.toLowerCase()
        const hay = `${o.id} ${o.externalId ?? ''} ${o.customerName ?? ''} ${o.customerPhone ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [orders, tab, channel, q])

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: 214 },
    { id: 'new', label: 'Нові', count: orders.filter((o) => o.status === 'Нове').length },
    {
      id: 'ship',
      label: 'До відправлення',
      count: orders.filter((o) => o.status === 'Підтверджено').length,
    },
    { id: 'sent', label: 'Відправлені', count: 9 },
    { id: 'cancelled', label: 'Скасовані', count: 6 },
  ]

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div>
      <PageHeader
        title="Замовлення"
        meta={`${orders.length} у моці · 214 замовлень`}
        actions={
          <>
            <Button onClick={() => setCreating(true)}>Створити замовлення</Button>
            <Button variant="secondary">Експорт</Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(t.id === 'all' ? '/orders' : `/orders?tab=${t.id}`)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-[var(--primary)] text-white'
                : 'bg-white border border-[var(--border)]'
            }`}
          >
            {t.label} {t.count}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Номер, телефон або номер на площадці"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">Канал</option>
          <option value="Rozetka">Rozetka</option>
          <option value="Epicentr">Epicentr</option>
          <option value="Prom">Prom</option>
          <option value="Instagram">Instagram</option>
        </Select>
        <button
          type="button"
          className="text-sm text-[var(--primary)]"
          onClick={() => {
            setQ('')
            setChannel('all')
          }}
        >
          Скинути
        </button>
      </div>

      <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
        <Button variant="secondary" className="h-8 border-white/30 bg-white/10 text-white">
          Створити накладні
        </Button>
        <Button variant="secondary" className="h-8 border-white/30 bg-white/10 text-white">
          Змінити статус
        </Button>
      </BulkActionBar>

      <div className="overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[var(--text-secondary)]">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Номер</th>
              <th className="px-3 py-2 font-medium">Створено</th>
              <th className="px-3 py-2 font-medium">Клієнт</th>
              <th className="px-3 py-2 font-medium">Склад</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Доставка</th>
              <th className="px-3 py-2 text-right font-medium">Сума</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-t border-[var(--border)] hover:bg-[var(--bg)]/60">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <Link className="font-medium text-[var(--primary)]" to={`/orders/${o.id}`}>
                    {o.id}
                  </Link>
                  <div className="text-xs text-[var(--text-secondary)]">
                    <StatusChip>{o.channel}</StatusChip>{' '}
                    {o.externalId ?? 'ручне'}
                  </div>
                </td>
                <td className="px-3 py-2.5">{formatDateTime(o.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <div>{o.customerName ?? '—'}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{o.city ?? ''}</div>
                </td>
                <td className="px-3 py-2.5">{o.itemsLabel}</td>
                <td className="px-3 py-2.5">
                  <StatusChip tone={chipTone(o.status)}>{o.status}</StatusChip>
                  {o.confirmLabel ? (
                    <div
                      className={`mt-1 text-xs ${
                        (o.confirmDeadlineMinutes ?? 9999) < 120
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {o.confirmLabel}
                    </div>
                  ) : null}
                  {o.cancelReason ? (
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{o.cancelReason}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  {o.ttn ? (
                    <div>
                      <div className="font-medium">{o.ttn}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{o.ttnStatus}</div>
                    </div>
                  ) : (
                    o.delivery
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-medium">{money(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-sm text-[var(--text-secondary)]">
        1–{filtered.length} з {orders.length} (мокові рядки)
      </div>

      {creating ? (
        <CreateOrderModal
          products={products.filter((p) => p.status === 'Активний' && p.available > 0)}
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false)
            await load()
            navigate(`/orders/${id}`)
          }}
        />
      ) : null}
    </div>
  )
}

function CreateOrderModal({
  products,
  onClose,
  onCreated,
}: {
  products: Product[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>('Нова Пошта')
  const [deliveryType, setDeliveryType] = useState<(typeof DELIVERY_TYPES)[number]>('Відділення')
  const [deliveryDetail, setDeliveryDetail] = useState('')
  const [deliveryPayer, setDeliveryPayer] =
    useState<(typeof DELIVERY_PAYERS)[number]>('Отримувач')
  const [payment, setPayment] = useState<(typeof PAYMENTS)[number]>('Під час отримання')
  const [lines, setLines] = useState<{ key: string; sku: string; qty: number }[]>([
    { key: 'line-1', sku: products[0]?.sku ?? '', qty: 1 },
  ])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEscapeKey(true, onClose)

  const detailPlaceholder =
    deliveryType === 'Адреса'
      ? 'Вулиця, будинок, квартира'
      : deliveryType === 'Поштомат'
        ? 'Номер поштомату'
        : 'Наприклад, Відділення №25'

  const lineTotal = lines.reduce((sum, line) => {
    const p = products.find((x) => x.sku === line.sku)
    return sum + (p?.price ?? 0) * Math.max(0, line.qty || 0)
  }, 0)

  const qtyBySku = lines.reduce((map, line) => {
    if (!line.sku) return map
    map.set(line.sku, (map.get(line.sku) ?? 0) + Math.max(0, line.qty || 0))
    return map
  }, new Map<string, number>())

  const itemsValid =
    lines.length > 0 &&
    lines.every((line) => line.sku && line.qty >= 1) &&
    [...qtyBySku.entries()].every(([sku, qty]) => {
      const p = products.find((x) => x.sku === sku)
      return Boolean(p && qty <= p.available)
    })

  function updateLine(key: string, patch: Partial<{ sku: string; qty: number }>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.sku))
    const next = products.find((p) => !used.has(p.sku)) ?? products[0]
    setLines((prev) => [
      ...prev,
      { key: `line-${Date.now()}`, sku: next?.sku ?? '', qty: 1 },
    ])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)))
  }

  const detailLabel =
    deliveryType === 'Адреса' ? 'Адреса' : deliveryType === 'Поштомат' ? 'Поштомат' : 'Відділення'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[var(--radius)] bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Створити замовлення</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Ручний канал (Instagram Direct тощо). Резервує залишок. ТТН НП/МЄ — пізніше; зараз
          зберігаємо спосіб доставки й оплати для накладної.
        </p>

        <div className="mt-4 space-y-4">
          <Panel title="Клієнт">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-[var(--border)]">
                  <th className="w-36 py-2 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    Імʼя
                  </th>
                  <td className="py-2">
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Імʼя отримувача"
                      autoFocus
                    />
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    Телефон
                  </th>
                  <td className="py-2">
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+380…"
                    />
                  </td>
                </tr>
                <tr>
                  <th className="py-2 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    Місто
                  </th>
                  <td className="py-2">
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Київ"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </Panel>

          <Panel title="Доставка і оплата">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-[var(--border)]">
                  <th className="w-36 py-2 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    Служба
                  </th>
                  <td className="py-2">
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
                  </td>
                  <th className="w-28 py-2 pl-4 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    Тип
                  </th>
                  <td className="py-2">
                    <Select
                      className="w-full"
                      value={deliveryType}
                      onChange={(e) =>
                        setDeliveryType(e.target.value as (typeof DELIVERY_TYPES)[number])
                      }
                    >
                      {DELIVERY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    {detailLabel}
                  </th>
                  <td className="py-2" colSpan={3}>
                    <Input
                      value={deliveryDetail}
                      onChange={(e) => setDeliveryDetail(e.target.value)}
                      placeholder={detailPlaceholder}
                    />
                  </td>
                </tr>
                <tr>
                  <th className="py-2 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    Платник
                  </th>
                  <td className="py-2">
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
                  </td>
                  <th className="py-2 pl-4 pr-3 text-left font-medium text-[var(--text-secondary)]">
                    Оплата
                  </th>
                  <td className="py-2">
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
                  </td>
                </tr>
              </tbody>
            </table>
            {payment === 'Накладений платіж' ? (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Накладений платіж (післяплата / COD) піде в ТТН {carrier} при створенні накладної —
                сума = залишок по замовленню.
              </p>
            ) : null}
          </Panel>

          <Panel
            title={
              <div className="flex items-center justify-between gap-2">
                <span>Товари</span>
                <Button
                  type="button"
                  variant="quiet"
                  className="h-auto py-0 font-medium"
                  disabled={products.length === 0}
                  onClick={addLine}
                >
                  + Додати позицію
                </Button>
              </div>
            }
          >
            {products.length === 0 ? (
              <p className="text-sm text-[var(--error)]">Немає товарів у наявності</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-[var(--text-secondary)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="w-8 pb-2 text-left font-medium">#</th>
                        <th className="pb-2 text-left font-medium">Товар</th>
                        <th className="w-24 pb-2 text-right font-medium">Ціна</th>
                        <th className="w-20 pb-2 text-right font-medium">К-сть</th>
                        <th className="w-28 pb-2 text-right font-medium">Сума</th>
                        <th className="w-10 pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const product = products.find((p) => p.sku === line.sku)
                        const needed = qtyBySku.get(line.sku) ?? line.qty
                        const overstock = product ? needed > product.available : false
                        const rowSum = (product?.price ?? 0) * Math.max(0, line.qty || 0)
                        return (
                          <tr
                            key={line.key}
                            className="border-b border-[var(--border)] last:border-0"
                          >
                            <td className="py-2 align-middle text-[var(--text-secondary)]">
                              {index + 1}
                            </td>
                            <td className="py-2 align-middle">
                              <Select
                                className="w-full max-w-md"
                                value={line.sku}
                                onChange={(e) => updateLine(line.key, { sku: e.target.value })}
                              >
                                {products.map((p) => (
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
                                        needed !== line.qty ? ` (у рядках разом ${needed})` : ''
                                      }`
                                    : `доступно ${product.available} шт.`}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 align-middle text-right tabular-nums">
                              {product ? money(product.price) : '—'}
                            </td>
                            <td className="py-2 align-middle">
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
                            <td className="py-2 align-middle text-right font-medium tabular-nums">
                              {money(rowSum)}
                            </td>
                            <td className="py-2 align-middle text-right">
                              <Button
                                type="button"
                                variant="quiet"
                                className="h-8 px-1 text-[var(--error)]"
                                disabled={lines.length <= 1}
                                onClick={() => removeLine(line.key)}
                                aria-label="Прибрати позицію"
                              >
                                ×
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex justify-end text-base font-semibold">
                  Разом: {money(lineTotal)}
                </div>
              </>
            )}
          </Panel>

          {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Скасувати
          </Button>
          <Button
            disabled={saving || !customerName.trim() || !itemsValid}
            onClick={async () => {
              try {
                setSaving(true)
                setError(null)
                const merged = new Map<string, number>()
                for (const line of lines) {
                  merged.set(line.sku, (merged.get(line.sku) ?? 0) + line.qty)
                }
                const order = await api.createOrder({
                  channel: 'Instagram',
                  customerName: customerName.trim(),
                  customerPhone: phone.trim() || undefined,
                  city: city.trim() || undefined,
                  delivery: carrier,
                  deliveryType,
                  deliveryAddress: deliveryDetail.trim() || undefined,
                  deliveryPayer,
                  payment,
                  items: [...merged.entries()].map(([sku, qty]) => ({ sku, qty })),
                })
                onCreated(order.id)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Помилка')
              } finally {
                setSaving(false)
              }
            }}
          >
            Створити
          </Button>
        </div>
      </div>
    </div>
  )
}
