import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type OverviewPayload } from '@/api/client'
import { Button, PageHeader, Panel, StatusChip } from '@/components/ui'
import { money } from '@/lib/format'

export function OverviewPage() {
  const [data, setData] = useState<OverviewPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setData(await api.getOverview())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!data) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  const ov = data.meta.overview

  const metrics = [
    {
      label: 'Потрібно підтвердити',
      value: ov.needConfirm,
      hint: String(ov.needConfirmHint),
      to: '/orders?tab=new',
      emphasize: true,
    },
    {
      label: 'Очікують відправлення',
      value: ov.awaitingShip,
      hint: String(ov.awaitingShipHint),
      to: '/orders?tab=ship',
    },
    {
      label: 'Замовлення сьогодні',
      value: ov.ordersToday,
      hint: String(ov.ordersTodayHint),
      to: '/orders',
    },
    {
      label: 'Закінчуються',
      value: ov.lowStock ?? data.meta.counts.lowStock,
      hint: String(ov.lowStockHint),
      to: '/products?tab=low',
    },
  ]

  return (
    <div>
      <PageHeader title="Огляд" meta={data.meta.todayLabel} />

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Link
            key={m.label}
            to={m.to}
            className={`rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 transition hover:border-[var(--primary)] ${
              m.emphasize ? 'ring-1 ring-[var(--primary)]/20' : ''
            }`}
          >
            <div className="text-sm text-[var(--text-secondary)]">{m.label}</div>
            <div className="mt-1 text-3xl font-semibold">{m.value}</div>
            <div
              className={`mt-1 text-sm ${m.emphasize ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}
            >
              {m.hint}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Потрібно зробити">
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="pb-2 font-medium">Номер</th>
                <th className="pb-2 font-medium">Канал</th>
                <th className="pb-2 font-medium">Клієнт</th>
                <th className="pb-2 font-medium">Що зробити</th>
                <th className="pb-2 text-right font-medium">Сума</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {data.todo.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5">
                    <Link className="font-medium text-[var(--primary)]" to={`/orders/${row.id}`}>
                      {row.id}
                    </Link>
                  </td>
                  <td className="py-2.5">
                    <StatusChip>{row.channel}</StatusChip>
                  </td>
                  <td className="py-2.5">{row.customerName ?? '—'}</td>
                  <td className={`py-2.5 ${row.urgent ? 'text-[var(--warning)]' : ''}`}>
                    {row.action}
                  </td>
                  <td className="py-2.5 text-right">{money(row.total)}</td>
                  <td className="py-2.5 text-right">
                    <Button
                      variant="quiet"
                      onClick={async () => {
                        if (row.actionKind === 'confirm') {
                          await api.confirmOrder(row.id)
                          await load()
                        } else {
                          window.location.href = `/orders/${row.id}`
                        }
                      }}
                    >
                      {row.actionKind === 'confirm' ? 'Підтвердити' : 'Накладна'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3">
            <Link className="text-sm text-[var(--primary)]" to="/orders">
              Усі замовлення
            </Link>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Інтеграції">
            <ul className="space-y-3 text-sm">
              {data.integrations.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{i.name}</div>
                    <div
                      className={
                        i.tabTone === 'error'
                          ? 'text-[var(--error)]'
                          : i.tabTone === 'warn'
                            ? 'text-[var(--warning)]'
                            : 'text-[var(--text-secondary)]'
                      }
                    >
                      {i.summary}
                    </div>
                  </div>
                  {i.hasRetry ? (
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        await api.retryIntegration(i.id)
                        await load()
                      }}
                    >
                      Повторити
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Link className="text-sm text-[var(--primary)]" to="/integrations">
                Усі інтеграції
              </Link>
            </div>
          </Panel>

          <Panel title="Закінчуються">
            {data.lowStockSample ? (
              <div className="text-sm">
                <Link className="font-medium" to={`/products/${data.lowStockSample.sku}`}>
                  {data.lowStockSample.name}
                </Link>
                <div className="text-[var(--text-secondary)]">
                  {data.lowStockSample.available} шт.
                </div>
                <div className="mt-2 text-[var(--text-secondary)]">ще 11 товарів</div>
                <Link className="mt-1 inline-block text-[var(--primary)]" to="/products?tab=low">
                  Усі 12
                </Link>
              </div>
            ) : (
              <p className="text-[var(--text-secondary)]">Немає</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
