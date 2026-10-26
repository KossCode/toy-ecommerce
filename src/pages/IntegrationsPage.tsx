import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  type IntegrationSchedule,
  type IntegrationWriteMode,
  type IntegrationsFile,
  type Me,
  type ScheduleFlow,
  type ScheduleKind,
} from '@/api/client'
import { Button, Input, PageHeader, Panel, Select, StatusChip, chipTone } from '@/components/ui'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'

const WRITE_MODES: IntegrationWriteMode[] = ['OFF', 'READ_ONLY', 'DRY_RUN', 'LIVE']
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const
const FLOW_LABEL: Record<ScheduleFlow, string> = {
  orders: 'Опитування замовлень',
  feed: 'Пересборка фіду',
}
const ALL_FLOWS: ScheduleFlow[] = ['orders', 'feed']

function minSeconds(flow: ScheduleFlow) {
  return flow === 'feed' ? 15 * 60 : 90
}

function previewLabel(draft: {
  kind: ScheduleKind
  enabled: boolean
  everySeconds: number
  daysOfWeek: number[]
  hour: number
  minute: number
}): string {
  if (!draft.enabled) return 'вимкнено'
  if (draft.kind === 'INTERVAL') {
    const sec = draft.everySeconds
    if (sec % 3600 === 0) return `кожні ${sec / 3600} год`
    if (sec % 60 === 0) return `кожні ${sec / 60} хв`
    return `кожні ${sec} с`
  }
  const days = draft.daysOfWeek
  const dayLabel =
    days.length === 7
      ? 'щодня'
      : days.join(',') === '1,2,3,4,5'
        ? 'Пн–Пт'
        : days.map((d) => DAY_NAMES[d - 1]).join(', ')
  return `${dayLabel} о ${String(draft.hour).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`
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
  const [kind, setKind] = useState<ScheduleKind>(schedule?.kind ?? (flow === 'feed' ? 'CALENDAR' : 'INTERVAL'))
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
  const [hour, setHour] = useState(schedule?.hour ?? (flow === 'feed' ? 0 : 9))
  const [minute, setMinute] = useState(schedule?.minute ?? (flow === 'feed' ? 5 : 0))
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
        setHour(0)
        setMinute(5)
      } else {
        setKind('INTERVAL')
        setUnit('seconds')
        setAmount(90)
      }
    }
  }

  const everySeconds =
    unit === 'hours' ? amount * 3600 : unit === 'minutes' ? amount * 60 : amount

  const draft = {
    kind,
    enabled: true,
    everySeconds,
    daysOfWeek: days,
    hour,
    minute,
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (kind === 'INTERVAL' && everySeconds < minSec) {
        throw new Error(`Мінімальний інтервал — ${minSec} с`)
      }
      if (kind === 'CALENDAR' && days.length === 0) {
        throw new Error('Оберіть хоча б один день')
      }
      const body =
        kind === 'INTERVAL'
          ? { kind, enabled: true, everySeconds }
          : { kind, enabled: true, daysOfWeek: days, hour, minute }
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
              Europe/Kyiv · попередній перегляд: {previewLabel(draft)}
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
            <div className="mb-2 text-[var(--text-secondary)]">Тип</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={kind === 'INTERVAL' ? 'primary' : 'secondary'}
                onClick={() => setKind('INTERVAL')}
              >
                Інтервал
              </Button>
              <Button
                variant={kind === 'CALENDAR' ? 'primary' : 'secondary'}
                onClick={() => setKind('CALENDAR')}
              >
                За календарем
              </Button>
            </div>
          </div>

          {kind === 'INTERVAL' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Кожні</span>
              <Input
                type="number"
                min={1}
                className="w-24"
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
            <div className="space-y-3">
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
              <div className="flex flex-wrap items-center gap-2">
                <span>о</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  className="w-20"
                  value={hour}
                  onChange={(e) => setHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
                />
                <span>:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  className="w-20"
                  value={minute}
                  onChange={(e) =>
                    setMinute(Math.min(59, Math.max(0, Number(e.target.value) || 0)))
                  }
                />
              </div>
            </div>
          )}

          {error ? <p className="text-[var(--error)]">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Скасувати
          </Button>
          <Button disabled={busy || (mode === 'add' && availableFlows.length === 0)} onClick={() => void save()}>
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
      const body =
        schedule.kind === 'INTERVAL'
          ? {
              kind: schedule.kind,
              enabled: false,
              everySeconds: schedule.everySeconds ?? minSeconds(schedule.flow),
            }
          : {
              kind: schedule.kind,
              enabled: false,
              daysOfWeek: schedule.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7],
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

export function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsFile | null>(null)
  const [active, setActive] = useState('epicentr')
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [modeMsg, setModeMsg] = useState<string | null>(null)

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

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!data) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  const mp = data.marketplaces.find((m) => m.id === active) ?? data.marketplaces[0]
  const isOwner = me?.role === 'OWNER'
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
              setActive(m.id)
              setModeMsg(null)
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
                      <Link className="text-[var(--primary)]" to={`/products/${e.sku}`}>
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

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Готовність товарів">
          <div className="text-sm">
            Готові {mp.ready.ready} з {mp.ready.total}
          </div>
          <Link className="mt-1 inline-block text-sm text-[var(--primary)]" to="/products?tab=notReady">
            Не готові {mp.ready.notReady}
          </Link>
          <ul className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
            {mp.ready.reasons.map((r) => (
              <li key={r.text}>
                {r.text} — {r.count}{' '}
                {r.count === 1 ? 'товар' : r.count < 5 ? 'товари' : 'товарів'}
              </li>
            ))}
          </ul>
        </Panel>

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
                        {m}
                        {WRITE_MODES.indexOf(m) > WRITE_MODES.indexOf(maxMode)
                          ? ' (потрібен вищий ceiling)'
                          : ''}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span>{currentMode}</span>
                )}
                <span className="text-xs text-[var(--text-secondary)]">
                  ефективний {String(mp.connection.effectiveMode ?? currentMode)} · max {maxMode}
                </span>
              </dd>
            </div>
            {modeMsg ? <p className="text-xs text-[var(--text-secondary)]">{modeMsg}</p> : null}
            {mp.connection.tokenMasked ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Токен API</dt>
                <dd>
                  {String(mp.connection.tokenMasked)}{' '}
                  <Button variant="quiet" disabled>
                    Замінити
                  </Button>
                </dd>
              </div>
            ) : null}
            {mp.connection.login ? (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Логін</dt>
                <dd>{String(mp.connection.login)}</dd>
              </div>
            ) : null}
            {mp.connection.passwordMasked ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Пароль</dt>
                <dd>
                  {String(mp.connection.passwordMasked)}{' '}
                  <Button variant="quiet" disabled>
                    Змінити
                  </Button>
                </dd>
              </div>
            ) : null}
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

      <details className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer text-[var(--text-secondary)]">
          Показати технічні деталі
        </summary>
        <p className="mt-2 text-[var(--text-secondary)]">Журнал запитів — згорнуто за замовчуванням.</p>
      </details>
    </div>
  )
}
