import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  WRITE_MODE_LABEL,
  type IntegrationOutboxItem,
  type IntegrationProductsPayload,
  type IntegrationSchedule,
  type IntegrationSyncProduct,
  type IntegrationWriteMode,
  type IntegrationsFile,
  type Me,
  type ScheduleFlow,
  type ScheduleKind,
} from '@/api/client'
import { Button, Input, PageHeader, Panel, Select, StatusChip, chipTone } from '@/components/ui'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'

const PAGE_SIZES = [10, 25, 50] as const
type SyncSortKey = 'sku' | 'name' | 'channelState' | 'lastSyncedAt'

const WRITE_MODES: IntegrationWriteMode[] = ['OFF', 'READ_ONLY', 'DRY_RUN', 'LIVE']

function modeLabel(mode: string): string {
  return WRITE_MODE_LABEL[mode as IntegrationWriteMode] ?? mode
}

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const
const FLOW_LABEL: Record<ScheduleFlow, string> = {
  orders: 'Опитування замовлень',
  feed: 'Пересборка фіду',
}
const ALL_FLOWS: ScheduleFlow[] = ['orders', 'feed']

function minSeconds(flow: ScheduleFlow) {
  return flow === 'feed' ? 15 * 60 : 90
}

function formatDaysUk(days: number[]): string {
  if (days.length === 7) return 'щодня'
  if (days.join(',') === '1,2,3,4,5') return 'Пн–Пт'
  return days.map((d) => DAY_NAMES[d - 1]).join(', ')
}

function previewLabel(draft: {
  kind: ScheduleKind
  enabled: boolean
  everySeconds: number
  daysOfWeek: number[]
  hour: number
  minute: number
  windowStart?: string | null
  windowEnd?: string | null
}): string {
  if (!draft.enabled) return 'вимкнено'
  const dayLabel = formatDaysUk(draft.daysOfWeek)
  if (draft.kind === 'INTERVAL') {
    const sec = draft.everySeconds
    let every =
      sec % 3600 === 0
        ? `кожні ${sec / 3600} год`
        : sec % 60 === 0
          ? `кожні ${sec / 60} хв`
          : `кожні ${sec} с`
    if (draft.daysOfWeek.length < 7) every += `, ${dayLabel}`
    if (draft.windowStart && draft.windowEnd) every += `, ${draft.windowStart}–${draft.windowEnd}`
    return every
  }
  return `${dayLabel} о ${String(draft.hour).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`
}

function hm(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseHm(raw: string | undefined): { h: number; m: number } | null {
  if (!raw) return null
  const [a, b] = raw.split(':')
  const h = Number(a)
  const m = Number(b)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return { h, m }
}

type ScheduleModalMode = 'edit' | 'add'

function ScheduleEditModal({
  marketplaceId,
  mode,
  schedule,
  availableFlows,
  onClose,
  onSaved,
}: {
  marketplaceId: string
  mode: ScheduleModalMode
  schedule: IntegrationSchedule | null
  availableFlows: ScheduleFlow[]
  onClose: () => void
  onSaved: (mp: IntegrationsFile['marketplaces'][0]) => void
}) {
  const initialFlow = schedule?.flow ?? availableFlows[0] ?? 'orders'
  const [flow, setFlow] = useState<ScheduleFlow>(initialFlow)
  const minSec = minSeconds(flow)
  const [kind, setKind] = useState<ScheduleKind>(
    schedule?.kind ?? (flow === 'feed' ? 'CALENDAR' : 'INTERVAL'),
  )
  const [unit, setUnit] = useState<'seconds' | 'minutes' | 'hours'>(() => {
    const s = schedule?.everySeconds ?? minSec
    if (s % 3600 === 0) return 'hours'
    if (s % 60 === 0) return 'minutes'
    return 'seconds'
  })
  const [amount, setAmount] = useState(() => {
    const s = schedule?.everySeconds ?? minSec
    if (s % 3600 === 0) return s / 3600
    if (s % 60 === 0) return s / 60
    return s
  })
  const [days, setDays] = useState<number[]>(schedule?.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7])
  const [onceAt, setOnceAt] = useState(() =>
    hm(schedule?.hour ?? (flow === 'feed' ? 0 : 9), schedule?.minute ?? (flow === 'feed' ? 5 : 0)),
  )
  const [useWindow, setUseWindow] = useState(Boolean(schedule?.windowStart && schedule?.windowEnd))
  const [windowStart, setWindowStart] = useState(schedule?.windowStart ?? '08:00')
  const [windowEnd, setWindowEnd] = useState(schedule?.windowEnd ?? '20:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(true, onClose)
  useBodyScrollLock(true)

  function applyFlowDefaults(next: ScheduleFlow) {
    setFlow(next)
    if (mode === 'add') {
      if (next === 'feed') {
        setKind('CALENDAR')
        setDays([1, 2, 3, 4, 5, 6, 7])
        setOnceAt('00:05')
        setUseWindow(false)
      } else {
        setKind('INTERVAL')
        setUnit('seconds')
        setAmount(90)
        setDays([1, 2, 3, 4, 5, 6, 7])
        setUseWindow(false)
      }
    }
  }

  const everySeconds =
    unit === 'hours' ? amount * 3600 : unit === 'minutes' ? amount * 60 : amount
  const once = parseHm(onceAt) ?? { h: 0, m: 0 }
  const activeWindowStart = useWindow && kind === 'INTERVAL' ? windowStart : null
  const activeWindowEnd = useWindow && kind === 'INTERVAL' ? windowEnd : null

  const draft = {
    kind,
    enabled: true,
    everySeconds,
    daysOfWeek: days,
    hour: once.h,
    minute: once.m,
    windowStart: activeWindowStart,
    windowEnd: activeWindowEnd,
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (days.length === 0) throw new Error('Оберіть хоча б один день')
      if (kind === 'INTERVAL' && everySeconds < minSec) {
        throw new Error(`Мінімальний інтервал — ${minSec} с`)
      }
      if (kind === 'INTERVAL' && useWindow) {
        const start = parseHm(windowStart)
        const end = parseHm(windowEnd)
        if (!start || !end) throw new Error('Некоректний проміжок часу')
        if (end.h * 60 + end.m <= start.h * 60 + start.m) {
          throw new Error('Кінець проміжку має бути пізніше за початок')
        }
      }
      const body =
        kind === 'INTERVAL'
          ? {
              kind,
              enabled: true,
              everySeconds,
              daysOfWeek: days,
              windowStart: activeWindowStart,
              windowEnd: activeWindowEnd,
            }
          : { kind, enabled: true, daysOfWeek: days, hour: once.h, minute: once.m }
      const mp = await api.putIntegrationSchedule(marketplaceId, flow, body)
      onSaved(mp)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка збереження')
    } finally {
      setBusy(false)
    }
  }

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))
  }

  const title = mode === 'add' ? 'Додати розклад' : `Редагувати · ${FLOW_LABEL[flow]}`

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
        aria-labelledby="schedule-edit-title"
        data-modal-scroll
        className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="schedule-edit-title" className="text-lg font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Europe/Kyiv · {previewLabel(draft)}
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

        <div className="space-y-4 px-5 py-4 text-sm">
          {mode === 'add' ? (
            <label className="block space-y-1">
              <span className="text-[var(--text-secondary)]">Потік</span>
              <Select
                className="w-full"
                value={flow}
                onChange={(e) => applyFlowDefaults(e.target.value as ScheduleFlow)}
              >
                {availableFlows.map((f) => (
                  <option key={f} value={f}>
                    {FLOW_LABEL[f]}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <div>
            <div className="mb-2 text-[var(--text-secondary)]">Як часто</div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button
                variant={kind === 'INTERVAL' ? 'primary' : 'secondary'}
                onClick={() => setKind('INTERVAL')}
              >
                Кожні N
              </Button>
              <Button
                variant={kind === 'CALENDAR' ? 'primary' : 'secondary'}
                onClick={() => setKind('CALENDAR')}
              >
                Один раз на день
              </Button>
            </div>
            {kind === 'INTERVAL' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Кожні</span>
                <Input
                  type="number"
                  min={1}
                  className="!w-24"
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                />
                <Select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as 'seconds' | 'minutes' | 'hours')}
                >
                  <option value="seconds">с</option>
                  <option value="minutes">хв</option>
                  <option value="hours">год</option>
                </Select>
                <span className="text-[var(--text-secondary)]">мін. {minSec} с</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span>о</span>
                <input
                  type="time"
                  value={onceAt}
                  onChange={(e) => setOnceAt(e.target.value || '00:00')}
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                />
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-[var(--text-secondary)]">Дні тижня</div>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((name, i) => {
                const d = i + 1
                const on = days.includes(d)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`rounded-md border px-2 py-1 ${
                      on
                        ? 'border-[var(--primary)] bg-[#e4f1ef] text-[var(--primary)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Усі дні = без обмеження. Інакше лише вибрані.
            </p>
          </div>

          {kind === 'INTERVAL' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useWindow}
                  onChange={(e) => setUseWindow(e.target.checked)}
                />
                Лише в проміжку часу
              </label>
              {useWindow ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)]">з</span>
                    <input
                      type="time"
                      value={windowStart}
                      onChange={(e) => setWindowStart(e.target.value || '00:00')}
                      className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)]">до</span>
                    <input
                      type="time"
                      value={windowEnd}
                      onChange={(e) => setWindowEnd(e.target.value || '00:00')}
                      className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-[var(--error)]">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Скасувати
          </Button>
          <Button
            disabled={busy || (mode === 'add' && availableFlows.length === 0)}
            onClick={() => void save()}
          >
            Зберегти
          </Button>
        </div>
      </div>
    </div>
  )
}

function ScheduleTable({
  marketplaceId,
  schedules,
  isOwner,
  onChanged,
}: {
  marketplaceId: string
  schedules: IntegrationSchedule[]
  isOwner: boolean
  onChanged: (mp: IntegrationsFile['marketplaces'][0]) => void
}) {
  const [modal, setModal] = useState<
    | { mode: 'edit'; schedule: IntegrationSchedule }
    | { mode: 'add' }
    | null
  >(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const enabledRows = schedules.filter((s) => s.enabled)
  const disabledFlows = ALL_FLOWS.filter((f) => {
    const row = schedules.find((s) => s.flow === f)
    return !row || !row.enabled
  })

  async function runNow(schedule: IntegrationSchedule) {
    if (!isOwner) return
    setBusyKey(schedule.flow)
    setMsg(null)
    try {
      await api.triggerJob(schedule.triggerName)
      setMsg(`Запущено: ${FLOW_LABEL[schedule.flow]}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не вдалося запустити')
    } finally {
      setBusyKey(null)
    }
  }

  async function remove(schedule: IntegrationSchedule) {
    if (!isOwner) return
    if (!window.confirm(`Вимкнути «${FLOW_LABEL[schedule.flow]}»?`)) return
    setBusyKey(schedule.flow)
    setMsg(null)
    try {
      const days = schedule.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7]
      const body =
        schedule.kind === 'INTERVAL'
          ? {
              kind: schedule.kind,
              enabled: false,
              everySeconds: schedule.everySeconds ?? minSeconds(schedule.flow),
              daysOfWeek: days,
              windowStart: schedule.windowStart ?? null,
              windowEnd: schedule.windowEnd ?? null,
            }
          : {
              kind: schedule.kind,
              enabled: false,
              daysOfWeek: days,
              hour: schedule.hour ?? 0,
              minute: schedule.minute ?? 0,
            }
      const mp = await api.putIntegrationSchedule(marketplaceId, schedule.flow, body)
      onChanged(mp)
      setMsg('Розклад вимкнено')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Коли CRM опитує замовлення і пересобирає файл фіду. Частоту скачування фіду задає кабінет
          площадки — тут її не змінюємо.
        </p>
        {isOwner ? (
          <Button
            disabled={disabledFlows.length === 0}
            onClick={() => setModal({ mode: 'add' })}
            title={
              disabledFlows.length === 0
                ? 'Обидва потоки вже в розкладі'
                : 'Додати вимкнений потік'
            }
          >
            Додати
          </Button>
        ) : null}
      </div>

      <table className="w-full text-sm">
        <thead className="text-[var(--text-secondary)]">
          <tr className="border-b border-[var(--border)]">
            <th className="pb-2 text-left font-medium">Потік</th>
            <th className="pb-2 text-left font-medium">Розклад</th>
            <th className="pb-2 text-left font-medium">Стан</th>
            <th className="pb-2 text-right font-medium">Дії</th>
          </tr>
        </thead>
        <tbody>
          {enabledRows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-6 text-center text-[var(--text-secondary)]">
                Немає увімкнених розкладів.
                {isOwner && disabledFlows.length > 0 ? ' Натисніть «Додати».' : null}
              </td>
            </tr>
          ) : (
            enabledRows.map((s) => (
              <tr key={s.flow} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2.5 font-medium">{FLOW_LABEL[s.flow]}</td>
                <td className="py-2.5 text-[var(--text-secondary)]">{s.label}</td>
                <td className="py-2.5">
                  <StatusChip tone="success">Увімкнено</StatusChip>
                </td>
                <td className="py-2.5 text-right">
                  {isOwner ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="quiet"
                        disabled={busyKey === s.flow}
                        onClick={() => setModal({ mode: 'edit', schedule: s })}
                      >
                        Змінити
                      </Button>
                      <Button
                        variant="quiet"
                        disabled={busyKey === s.flow}
                        onClick={() => void runNow(s)}
                      >
                        Запустити
                      </Button>
                      <Button
                        variant="quiet"
                        disabled={busyKey === s.flow}
                        onClick={() => void remove(s)}
                      >
                        Видалити
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">лише перегляд</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {msg ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{msg}</p> : null}

      {modal?.mode === 'edit' ? (
        <ScheduleEditModal
          marketplaceId={marketplaceId}
          mode="edit"
          schedule={modal.schedule}
          availableFlows={[]}
          onClose={() => setModal(null)}
          onSaved={onChanged}
        />
      ) : null}
      {modal?.mode === 'add' ? (
        <ScheduleEditModal
          marketplaceId={marketplaceId}
          mode="add"
          schedule={null}
          availableFlows={disabledFlows}
          onClose={() => setModal(null)}
          onSaved={onChanged}
        />
      ) : null}
    </>
  )
}

function SortTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string
  column: SyncSortKey
  sortKey: SyncSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SyncSortKey) => void
  className?: string
}) {
  const active = sortKey === column
  return (
    <th className={`pb-2 text-left align-bottom font-medium ${className}`}>
      <button
        type="button"
        className={`inline-flex h-6 items-center gap-1 text-sm leading-none ${
          active ? 'text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
        }`}
        onClick={() => onSort(column)}
      >
        {label}
        <span className="inline-block w-3 text-center text-[10px] leading-none" aria-hidden>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function syncSortValue(p: IntegrationSyncProduct, key: SyncSortKey): string {
  switch (key) {
    case 'sku':
      return p.sku
    case 'name':
      return p.name
    case 'channelState':
      return p.channelState
    case 'lastSyncedAt':
      return p.lastSyncedAt ?? ''
  }
}

function SyncProductsPanel({
  marketplaceId,
  ready,
  canEdit,
}: {
  marketplaceId: string
  ready: IntegrationsFile['marketplaces'][0]['ready']
  canEdit: boolean
}) {
  const [payload, setPayload] = useState<IntegrationProductsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busySku, setBusySku] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SyncSortKey>('sku')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10)
  const [page, setPage] = useState(0)

  async function load() {
    try {
      setPayload(await api.getIntegrationProducts(marketplaceId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    }
  }

  useEffect(() => {
    setPayload(null)
    setSelected(new Set())
    setAddOpen(false)
    setPage(0)
    void load()
  }, [marketplaceId])

  const sorted = useMemo(() => {
    if (!payload) return []
    const rows = [...payload.products]
    rows.sort((a, b) => {
      const av = syncSortValue(a, sortKey)
      const bv = syncSortValue(b, sortKey)
      if (!av && bv) return 1
      if (av && !bv) return -1
      const cmp = av.localeCompare(bv, 'uk', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [payload, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  async function setEnabled(items: { sku: string; enabled: boolean }[]) {
    setBusySku(items[0]?.sku ?? 'batch')
    setMsg(null)
    try {
      setPayload(await api.patchIntegrationProducts(marketplaceId, items))
      setMsg(items.every((i) => i.enabled) ? 'Додано до синхронізації' : 'Оновлено')
      setAddOpen(false)
      setSelected(new Set())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setBusySku(null)
    }
  }

  function onSort(key: SyncSortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!payload) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-[var(--text-secondary)]">
          На синхронізації {payload.products.length} · готові {ready.ready} з {ready.total}
          {ready.notReady > 0 ? (
            <>
              {' · '}
              <Link className="text-[var(--primary)]" to="/products?tab=notReady">
                не готові {ready.notReady}
              </Link>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            На сторінці
            <Select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
                setPage(0)
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          {canEdit ? (
            <Button disabled={payload.candidates.length === 0} onClick={() => setAddOpen(true)}>
              Додати
            </Button>
          ) : null}
        </div>
      </div>

      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[34%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[22%]" />
        </colgroup>
        <thead className="text-[var(--text-secondary)]">
          <tr className="border-b border-[var(--border)]">
            <SortTh label="SKU" column="sku" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh
              label="Назва"
              column="name"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortTh
              label="Стан"
              column="channelState"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortTh
              label="Ост. синхр."
              column="lastSyncedAt"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <th className="pb-2 text-right align-bottom text-sm font-medium leading-none">
              <span className="inline-flex h-6 items-center">Дії</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payload.products.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-[var(--text-secondary)]">
                Немає товарів на синхронізації.
                {canEdit && payload.candidates.length > 0 ? ' Натисніть «Додати».' : null}
              </td>
            </tr>
          ) : (
            pageRows.map((p) => (
              <SyncProductRow
                key={p.sku}
                product={p}
                marketplaceId={marketplaceId}
                canEdit={canEdit}
                busy={busySku === p.sku}
                onStop={() => void setEnabled([{ sku: p.sku, enabled: false }])}
              />
            ))
          )}
        </tbody>
      </table>

      {payload.products.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
          <span>
            {sorted.length === 0
              ? '0'
              : `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, sorted.length)}`}{' '}
            з {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="quiet"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Назад
            </Button>
            <span>
              {safePage + 1} / {pageCount}
            </span>
            <Button
              variant="quiet"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Далі
            </Button>
          </div>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{msg}</p> : null}

      {addOpen ? (
        <AddSyncProductsModal
          candidates={payload.candidates}
          selected={selected}
          setSelected={setSelected}
          busy={busySku === 'batch'}
          onClose={() => {
            setAddOpen(false)
            setSelected(new Set())
          }}
          onConfirm={() =>
            void setEnabled([...selected].map((sku) => ({ sku, enabled: true })))
          }
        />
      ) : null}
    </>
  )
}

function SyncProductRow({
  product,
  marketplaceId,
  canEdit,
  busy,
  onStop,
}: {
  product: IntegrationSyncProduct
  marketplaceId: string
  canEdit: boolean
  busy: boolean
  onStop: () => void
}) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-3 align-middle font-mono text-xs leading-5">{product.sku}</td>
      <td className="py-3 align-middle">
        <div className="truncate font-medium leading-5" title={product.name}>
          {product.name}
        </div>
        {product.lastError ? (
          <div className="mt-0.5 truncate text-xs text-[var(--error)]" title={product.lastError}>
            {product.lastError}
          </div>
        ) : null}
      </td>
      <td className="py-3 align-middle">
        <StatusChip tone={chipTone(product.channelState)}>{product.channelState}</StatusChip>
      </td>
      <td className="py-3 align-middle whitespace-nowrap text-[var(--text-secondary)] leading-5">
        {product.lastSyncedAt ?? '—'}
      </td>
      <td className="py-3 align-middle text-right">
        <div className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <Link
            className="text-sm leading-5 text-[var(--primary)] hover:underline"
            to={`/products/${product.sku}`}
            state={{ from: `/integrations/${marketplaceId}` }}
          >
            Відкрити
          </Link>
          {canEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={onStop}
              className="text-sm leading-5 text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Зупинити синхронізацію
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

function AddSyncProductsModal({
  candidates,
  selected,
  setSelected,
  busy,
  onClose,
  onConfirm,
}: {
  candidates: IntegrationSyncProduct[]
  selected: Set<string>
  setSelected: (next: Set<string>) => void
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  useEscapeKey(true, onClose)
  useBodyScrollLock(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-[var(--radius)] bg-white p-5 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">Додати товари</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Активні товари без увімкненого каналу на цій площадці.
        </p>
        <ul className="mb-4 max-h-64 space-y-2 overflow-auto">
          {candidates.map((c) => {
            const on = selected.has(c.sku)
            return (
              <li key={c.sku}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(selected)
                      if (on) next.delete(c.sku)
                      else next.add(c.sku)
                      setSelected(next)
                    }}
                  />
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 font-mono text-xs text-[var(--text-secondary)]">
                      {c.sku}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Скасувати
          </Button>
          <Button disabled={busy || selected.size === 0} onClick={onConfirm}>
            Увімкнути ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  )
}

function OutboxPanel({ marketplaceId }: { marketplaceId: string }) {
  const [items, setItems] = useState<IntegrationOutboxItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const payload = await api.getIntegrationOutbox(marketplaceId)
      setItems(payload.items)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
      setItems([])
    }
  }

  useEffect(() => {
    setItems(null)
    void load()
  }, [marketplaceId])

  async function retryFailed() {
    setBusy(true)
    try {
      await api.retryIntegration(marketplaceId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setBusy(false)
    }
  }

  if (items === null && !error) {
    return <p className="text-sm text-[var(--text-secondary)]">Завантаження…</p>
  }

  return (
    <div>
      {error ? <p className="mb-2 text-sm text-[var(--error)]">{error}</p> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Активні та помилкові записи черги (без DONE).
        </p>
        <Button variant="quiet" disabled={busy} onClick={() => void retryFailed()}>
          Повторити помилки
        </Button>
      </div>
      {!items?.length ? (
        <p className="text-sm text-[var(--text-secondary)]">Черга порожня.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="pb-2 font-medium">ID</th>
                <th className="pb-2 font-medium">Тип</th>
                <th className="pb-2 font-medium">SKU / замовлення</th>
                <th className="pb-2 font-medium">Статус</th>
                <th className="pb-2 font-medium">Спроби</th>
                <th className="pb-2 font-medium">Помилка</th>
                <th className="pb-2 font-medium">Оновлено</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 tabular-nums">{row.id}</td>
                  <td className="py-2">{row.kind}</td>
                  <td className="py-2">
                    {row.sku ?? row.orderId ?? '—'}
                  </td>
                  <td className="py-2">
                    <StatusChip
                      tone={
                        row.status === 'FAILED' || row.status === 'BLOCKED'
                          ? 'error'
                          : row.status === 'IN_PROGRESS'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {row.status}
                    </StatusChip>
                  </td>
                  <td className="py-2 tabular-nums">{row.attempts}</td>
                  <td className="max-w-[220px] truncate py-2 text-[var(--text-secondary)]" title={row.lastError ?? ''}>
                    {row.lastError ?? '—'}
                  </td>
                  <td className="py-2 text-[var(--text-secondary)]">
                    {row.updatedAt.replace('T', ' ').slice(0, 16)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function IntegrationsPage() {
  const { marketplaceId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<IntegrationsFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [modeMsg, setModeMsg] = useState<string | null>(null)
  const [credOpen, setCredOpen] = useState(false)
  const [credToken, setCredToken] = useState('')
  const [credLogin, setCredLogin] = useState('')
  const [credPassword, setCredPassword] = useState('')
  const [credBusy, setCredBusy] = useState(false)
  const [credMsg, setCredMsg] = useState<string | null>(null)

  async function load() {
    try {
      setData(await api.getIntegrations())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    }
  }

  useEffect(() => {
    void load()
    void api
      .me()
      .then(setMe)
      .catch(() => setMe(null))
  }, [])

  useEffect(() => {
    setCredOpen(false)
    setCredToken('')
    setCredLogin('')
    setCredPassword('')
    setCredMsg(null)
    setModeMsg(null)
  }, [marketplaceId])

  useEffect(() => {
    if (!data?.marketplaces.length) return
    const ids = data.marketplaces.map((m) => m.id)
    const first = ids[0]
    if (!marketplaceId || !ids.includes(marketplaceId)) {
      navigate(`/integrations/${first}`, { replace: true })
    }
  }, [data, marketplaceId, navigate])

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!data) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  const mp =
    data.marketplaces.find((m) => m.id === marketplaceId) ?? data.marketplaces[0]
  if (!marketplaceId || mp.id !== marketplaceId) {
    return <p className="text-[var(--text-secondary)]">Завантаження…</p>
  }

  const isOwner = me?.role === 'OWNER'
  const canEditSync = me?.role === 'OWNER' || me?.role === 'MANAGER'
  const schedules = (mp.connection.schedules ?? []) as IntegrationSchedule[]
  const maxMode = String(mp.connection.maxMode ?? 'DRY_RUN') as IntegrationWriteMode
  const currentMode = String(mp.connection.mode ?? 'READ_ONLY') as IntegrationWriteMode

  async function changeMode(mode: IntegrationWriteMode) {
    if (!isOwner) return
    setModeMsg(null)
    try {
      await api.setIntegrationMode(mp.id, mode)
      await load()
      setModeMsg('Режим збережено')
    } catch (e) {
      setModeMsg(e instanceof Error ? e.message : 'Помилка')
    }
  }

  async function saveCredentials() {
    if (!isOwner) return
    setCredBusy(true)
    setCredMsg(null)
    try {
      const body =
        mp.id === 'prom'
          ? { token: credToken }
          : { login: credLogin, password: credPassword }
      await api.putIntegrationCredentials(mp.id, body)
      setCredOpen(false)
      setCredToken('')
      setCredLogin('')
      setCredPassword('')
      await load()
      setCredMsg('Ключі збережено')
    } catch (e) {
      setCredMsg(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setCredBusy(false)
    }
  }

  const usesToken = mp.id === 'prom'
  const hasCreds = Boolean(mp.connection.tokenMasked || mp.connection.passwordMasked)

  function replaceMarketplace(next: IntegrationsFile['marketplaces'][0]) {
    setData((prev) => {
      if (!prev) return prev
      return {
        marketplaces: prev.marketplaces.map((m) => (m.id === next.id ? next : m)),
      }
    })
  }

  return (
    <div>
      <PageHeader title="Інтеграції" />

      <div className="mb-4 flex flex-wrap gap-2">
        {data.marketplaces.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setModeMsg(null)
              navigate(`/integrations/${m.id}`)
            }}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              mp.id === m.id
                ? 'border-[var(--primary)] bg-[#e4f1ef] font-semibold text-[var(--primary)]'
                : 'border-[var(--border)] bg-white'
            }`}
          >
            <span
              className={`mr-2 inline-block h-2 w-2 rounded-full ${
                m.tabTone === 'error'
                  ? 'bg-[var(--error)]'
                  : m.tabTone === 'warn'
                    ? 'bg-[var(--warning)]'
                    : 'bg-[var(--success)]'
              }`}
            />
            {m.name} · {m.tabLabel}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <Panel title="Стан">
          <table className="w-full text-sm">
            <thead className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="pb-2 text-left font-medium">Потік</th>
                <th className="pb-2 text-left font-medium">Стан</th>
                <th className="pb-2 text-left font-medium">Коли</th>
              </tr>
            </thead>
            <tbody>
              {mp.flows.map((f) => (
                <tr key={f.name} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5">{f.name}</td>
                  <td className="py-2.5">
                    <StatusChip tone={chipTone(f.status)}>{f.status}</StatusChip>
                  </td>
                  <td className="py-2.5 text-[var(--text-secondary)]">
                    {f.when}
                    {f.link ? (
                      <a className="ml-2 text-[var(--primary)]" href="#">
                        {f.link}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {mp.errorBanner ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--error)]/30 bg-[#fdecea] px-4 py-3">
          <div>
            <div className="font-medium text-[var(--error)]">{mp.errorBanner.title}</div>
            <div className="text-sm text-[var(--text-secondary)]">{mp.errorBanner.nextTry}</div>
          </div>
          <Button
            onClick={async () => {
              await api.retryIntegration(mp.id)
              await load()
            }}
          >
            Повторити зараз
          </Button>
        </div>
      ) : null}

      {mp.moderationErrors.length > 0 ? (
        <div className="mb-4">
          <Panel title="Помилки модерації">
            <table className="w-full text-sm">
              <thead className="text-[var(--text-secondary)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="pb-2 text-left font-medium">Товар</th>
                  <th className="pb-2 text-left font-medium">Помилка</th>
                  <th className="pb-2 text-left font-medium">Коли</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {mp.moderationErrors.map((e) => (
                  <tr key={e.sku} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{e.sku}</div>
                    </td>
                    <td className="py-2.5">{e.error}</td>
                    <td className="py-2.5 text-[var(--text-secondary)]">{e.when}</td>
                    <td className="py-2.5 text-right">
                      <Link
                        className="text-[var(--primary)]"
                        to={`/products/${e.sku}`}
                        state={{ from: `/integrations/${mp.id}` }}
                      >
                        Відкрити товар
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Після виправлення товар повторно піде на модерацію з наступним оновленням фіду.
            </p>
          </Panel>
        </div>
      ) : null}

      <div className="mb-4">
        <Panel title="Товари на синхронізації">
          <SyncProductsPanel marketplaceId={mp.id} ready={mp.ready} canEdit={!!canEditSync} />
        </Panel>
      </div>

      <div className="mb-4">
        <Panel title="Підключення">
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Режим запису</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {isOwner ? (
                  <Select
                    value={currentMode}
                    onChange={(e) => void changeMode(e.target.value as IntegrationWriteMode)}
                  >
                    {WRITE_MODES.map((m) => (
                      <option
                        key={m}
                        value={m}
                        disabled={WRITE_MODES.indexOf(m) > WRITE_MODES.indexOf(maxMode)}
                      >
                        {modeLabel(m)}
                        {WRITE_MODES.indexOf(m) > WRITE_MODES.indexOf(maxMode)
                          ? ' (недоступно на цьому середовищі)'
                          : ''}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span>{modeLabel(currentMode)}</span>
                )}
              </dd>
            </div>
            {modeMsg ? <p className="text-xs text-[var(--text-secondary)]">{modeMsg}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">
                {usesToken ? 'Токен API' : 'Ключі API'}
              </dt>
              <dd className="flex flex-wrap items-center gap-2">
                {usesToken && mp.connection.tokenMasked ? (
                  <span>{String(mp.connection.tokenMasked)}</span>
                ) : null}
                {!usesToken && mp.connection.login ? (
                  <span className="text-[var(--text-secondary)]">
                    {String(mp.connection.login)}
                  </span>
                ) : null}
                {!usesToken && mp.connection.passwordMasked ? (
                  <span>{String(mp.connection.passwordMasked)}</span>
                ) : null}
                {!hasCreds ? (
                  <span className="text-[var(--text-secondary)]">не задано</span>
                ) : null}
                {isOwner ? (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setCredOpen((v) => !v)
                      setCredMsg(null)
                    }}
                  >
                    {hasCreds ? 'Замінити' : 'Додати'}
                  </Button>
                ) : null}
              </dd>
            </div>
            {mp.connection.credentialsUpdatedAt ? (
              <p className="text-xs text-[var(--text-secondary)]">
                Оновлено: {String(mp.connection.credentialsUpdatedAt)}
              </p>
            ) : null}
            {credOpen && isOwner ? (
              <div className="mt-2 space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3">
                {usesToken ? (
                  <label className="block text-sm">
                    <span className="text-[var(--text-secondary)]">Токен</span>
                    <Input
                      className="mt-1"
                      type="password"
                      autoComplete="off"
                      value={credToken}
                      onChange={(e) => setCredToken(e.target.value)}
                      placeholder="токен з кабінету Prom"
                    />
                  </label>
                ) : (
                  <>
                    <label className="block text-sm">
                      <span className="text-[var(--text-secondary)]">Логін</span>
                      <Input
                        className="mt-1"
                        value={credLogin}
                        onChange={(e) => setCredLogin(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--text-secondary)]">Пароль</span>
                      <Input
                        className="mt-1"
                        type="password"
                        value={credPassword}
                        onChange={(e) => setCredPassword(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                  </>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="quiet" onClick={() => setCredOpen(false)}>
                    Скасувати
                  </Button>
                  <Button
                    disabled={
                      credBusy ||
                      (usesToken ? !credToken.trim() : !credLogin.trim() || !credPassword.trim())
                    }
                    onClick={() => void saveCredentials()}
                  >
                    Зберегти
                  </Button>
                </div>
              </div>
            ) : null}
            {credMsg ? <p className="text-xs text-[var(--text-secondary)]">{credMsg}</p> : null}
            {mp.connection.feedUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Посилання на фід</dt>
                <dd className="flex max-w-full items-center gap-2">
                  <code className="break-all text-xs">{String(mp.connection.feedUrl)}</code>
                  <Button
                    variant="quiet"
                    onClick={() =>
                      void navigator.clipboard.writeText(String(mp.connection.feedUrl))
                    }
                  >
                    Копіювати
                  </Button>
                </dd>
              </div>
            ) : null}
            {mp.connection.priceSync ? (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Тип синхронізації цін</dt>
                <dd>{String(mp.connection.priceSync)}</dd>
              </div>
            ) : null}
          </dl>
          {Array.isArray(mp.connection.capabilities) ? (
            <ul className="mt-3 space-y-1 text-sm">
              {mp.connection.capabilities.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
          {mp.connection.caption ? (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              {String(mp.connection.caption)}
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="mb-4">
        <Panel title="Розклад CRM">
          <ScheduleTable
            marketplaceId={mp.id}
            schedules={schedules}
            isOwner={!!isOwner}
            onChanged={replaceMarketplace}
          />
        </Panel>
      </div>

      <div className="mb-4">
        <Panel title="Черга outbox">
          <OutboxPanel marketplaceId={mp.id} />
        </Panel>
      </div>

      <details className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer text-[var(--text-secondary)]">
          Показати технічні деталі
        </summary>
        <p className="mt-2 text-[var(--text-secondary)]">
          API mode: {currentMode} · max {maxMode} · feed rebuild debounce ~60 с після змін каталогу.
        </p>
      </details>
    </div>
  )
}
