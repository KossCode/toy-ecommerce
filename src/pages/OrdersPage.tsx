import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type OrderListItem } from '@/api/client'
import { BulkActionBar } from '@/components/BulkActionBar'
import { CreateOrderModal } from '@/components/CreateOrderModal'
import {
  Button,
  FilterTab,
  Input,
  ListFilters,
  PageHeader,
  Select,
  SortableTh,
  StatusChip,
  chipTone,
} from '@/components/ui'
import { formatDateTime, money } from '@/lib/format'
import { compareValues, useTableSort } from '@/lib/tableSort'

type Tab = 'all' | 'draft' | 'new' | 'ship' | 'sent' | 'cancelled'

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') as Tab) || 'all'
  type OrderSortKey =
    | 'id'
    | 'createdAt'
    | 'customer'
    | 'warehouse'
    | 'status'
    | 'delivery'
    | 'total'
  const { sortKey, sortDir, toggle: toggleSort } = useTableSort<OrderSortKey>('createdAt', 'desc')

  async function load() {
    setOrders(await api.getOrders())
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const rows = orders.filter((o) => {
      if (tab === 'draft' && o.status !== 'Чернетка') return false
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
    const valueOf = (o: OrderListItem): string | number => {
      switch (sortKey) {
        case 'id':
          return o.id
        case 'createdAt':
          return o.createdAt
        case 'customer':
          return o.customerName ?? ''
        case 'warehouse':
          return o.warehouse ?? o.itemsLabel
        case 'status':
          return o.status
        case 'delivery':
          return o.ttn ?? o.delivery
        case 'total':
          return o.total
      }
    }
    return [...rows].sort((a, b) => compareValues(valueOf(a), valueOf(b), sortDir))
  }, [orders, tab, channel, q, sortKey, sortDir])

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: orders.length },
    {
      id: 'draft',
      label: 'Чернетки',
      count: orders.filter((o) => o.status === 'Чернетка').length,
    },
    { id: 'new', label: 'Нові', count: orders.filter((o) => o.status === 'Нове').length },
    {
      id: 'ship',
      label: 'До відправлення',
      count: orders.filter((o) => o.status === 'Підтверджено').length,
    },
    {
      id: 'sent',
      label: 'Відправлені',
      count: orders.filter((o) => o.status === 'Відправлено').length,
    },
    {
      id: 'cancelled',
      label: 'Скасовані',
      count: orders.filter((o) => o.status === 'Скасовано').length,
    },
  ]

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div>
      <PageHeader
        title="Замовлення"
        meta={`${orders.length} замовлень`}
        actions={
          <>
            <Button onClick={() => setCreating(true)}>Створити замовлення</Button>
            <Button variant="secondary">Експорт</Button>
          </>
        }
      />

      <ListFilters
        tabs={tabs.map((t) => (
          <FilterTab
            key={t.id}
            active={tab === t.id}
            onClick={() => navigate(t.id === 'all' ? '/orders' : `/orders?tab=${t.id}`)}
          >
            {t.label}
            <span className={tab === t.id ? 'opacity-80' : 'text-[var(--text-secondary)]'}>
              {' '}
              {t.count}
            </span>
          </FilterTab>
        ))}
      >
        <Input
          className="min-w-[220px] max-w-sm flex-1"
          placeholder="Номер, телефон або номер на маркетплейсі"
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
          className="ml-auto text-sm text-[var(--primary)] hover:underline"
          onClick={() => {
            setQ('')
            setChannel('all')
          }}
        >
          Скинути
        </button>
      </ListFilters>

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
              <SortableTh
                label="Номер"
                active={sortKey === 'id'}
                dir={sortDir}
                onClick={() => toggleSort('id')}
              />
              <SortableTh
                label="Створено"
                active={sortKey === 'createdAt'}
                dir={sortDir}
                onClick={() => toggleSort('createdAt')}
              />
              <SortableTh
                label="Клієнт"
                active={sortKey === 'customer'}
                dir={sortDir}
                onClick={() => toggleSort('customer')}
              />
              <SortableTh
                label="Склад"
                active={sortKey === 'warehouse'}
                dir={sortDir}
                onClick={() => toggleSort('warehouse')}
              />
              <SortableTh
                label="Статус"
                active={sortKey === 'status'}
                dir={sortDir}
                onClick={() => toggleSort('status')}
              />
              <SortableTh
                label="Доставка"
                active={sortKey === 'delivery'}
                dir={sortDir}
                onClick={() => toggleSort('delivery')}
              />
              <SortableTh
                label="Сума"
                align="right"
                active={sortKey === 'total'}
                dir={sortDir}
                onClick={() => toggleSort('total')}
              />
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
        1–{filtered.length} з {filtered.length}
        {filtered.length !== orders.length ? ` (усього ${orders.length})` : ''}
      </div>

      {creating ? (
        <CreateOrderModal
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
