import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type OrderDetail } from '@/api/client'
import { Button, PageHeader, Panel, StatusChip, chipTone } from '@/components/ui'
import { formatDateLong, formatDateTime, money } from '@/lib/format'

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('покупець відмовився')

  async function load() {
    try {
      setOrder(await api.getOrder(id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!order) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  return (
    <div>
      <div className="mb-2 text-sm text-[var(--text-secondary)]">
        <Link to="/orders" className="text-[var(--primary)]">
          Замовлення
        </Link>{' '}
        / {order.id}
      </div>
      <PageHeader
        title={order.id}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusChip>{order.channel}</StatusChip>
            <StatusChip tone={chipTone(order.status)}>{order.status}</StatusChip>
            {order.confirmLabel ? (
              <span
                className={
                  (order.confirmDeadlineMinutes ?? 9999) < 120
                    ? 'text-[var(--warning)]'
                    : 'text-[var(--text-secondary)]'
                }
              >
                {order.confirmLabel}
              </span>
            ) : null}
            <span>· створено {formatDateLong(order.createdAt)}</span>
          </span>
        }
        actions={
          <>
            {order.status === 'Нове' ? (
              <Button
                onClick={async () => {
                  await api.confirmOrder(order.id)
                  await load()
                }}
              >
                Підтвердити
              </Button>
            ) : null}
            {order.status === 'Підтверджено' ? (
              <Button variant="secondary">Створити накладну</Button>
            ) : null}
            {order.status !== 'Скасовано' && order.status !== 'Доставлено' ? (
              <Button variant="quiet" onClick={() => setCancelOpen(true)}>
                Скасувати замовлення
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel title="Склад замовлення">
            <table className="w-full text-sm">
              <thead className="text-[var(--text-secondary)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="pb-2 text-left font-medium">Товар</th>
                  <th className="pb-2 text-right font-medium">К-сть</th>
                  <th className="pb-2 text-right font-medium">Ціна</th>
                  <th className="pb-2 text-right font-medium">Доступно</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const stock = order.stock.find((s) => s.sku === item.sku)?.available ?? 0
                  return (
                    <tr key={item.sku} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2.5">
                        <Link className="font-medium text-[var(--primary)]" to={`/products/${item.sku}`}>
                          {item.name}
                        </Link>
                        <div className="text-xs text-[var(--text-secondary)]">{item.sku}</div>
                      </td>
                      <td className="py-2.5 text-right">{item.qty}</td>
                      <td className="py-2.5 text-right">
                        <div>{money(item.price)}</div>
                        {item.oldPrice ? (
                          <div className="text-xs text-[var(--text-secondary)] line-through">
                            {money(item.oldPrice)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-right">{stock} шт.</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end text-base font-semibold">
              Разом: {money(order.total)}
            </div>
          </Panel>

          <Panel title="Історія">
            <ul className="space-y-3 text-sm">
              {order.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3">
                  <span className="w-28 shrink-0 text-[var(--text-secondary)]">
                    {formatDateTime(h.at)}
                  </span>
                  <span className="flex-1">{h.text}</span>
                  <span className="text-[var(--text-secondary)]">{h.who}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Клієнт і доставка">
            <dl className="space-y-2 text-sm">
              <Row label="Номер на площадці" value={order.externalId ?? '—'} />
              <Row label="Клієнт" value={order.customerName ?? '—'} />
              <Row label="Телефон" value={order.customerPhone ?? '—'} />
              <Row label="Місто" value={order.city ?? '—'} />
              <Row label="Доставка" value={order.delivery} />
              <Row label="Адреса" value={order.deliveryAddress ?? '—'} />
              <Row label="Оплата" value={order.payment} />
              <Row
                label="ТТН"
                value={
                  order.ttn
                    ? `${order.ttn}${order.ttnStatus ? ` · ${order.ttnStatus}` : ''}`
                    : 'Ще немає'
                }
              />
            </dl>
            {order.comment ? (
              <div className="mt-4 rounded-md bg-[var(--bg)] p-3 text-sm">
                <div className="mb-1 text-[var(--text-secondary)]">Коментар покупця</div>
                {order.comment}
              </div>
            ) : null}
            {order.cancelReason ? (
              <div className="mt-4 text-sm text-[var(--error)]">
                Причина скасування: {order.cancelReason}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>

      {cancelOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius)] bg-white p-5">
            <h2 className="text-lg font-semibold">Скасувати замовлення {order.id}?</h2>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Причина</span>
              <input
                className="h-9 w-full rounded-[var(--radius)] border border-[var(--border)] px-3"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelOpen(false)}>
                Залишити
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await api.cancelOrder(order.id, reason)
                  setCancelOpen(false)
                  await load()
                }}
              >
                Скасувати замовлення
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
