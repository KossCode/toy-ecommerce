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

const WRITE_MODES: IntegrationWriteMode[] = ['OFF', 'READ_ONLY', 'DRY_RUN', 'LIVE']
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

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

function ScheduleEditor({
  marketplaceId,
  schedule,
  isOwner,
  onSaved,
}: {
  marketplaceId: string
  schedule: IntegrationSchedule
  isOwner: boolean
  onSaved: (mp: IntegrationsFile['marketplaces'][0]) => void
}) {
  const minSec = schedule.flow === 'feed' ? 15 * 60 : 90
  const [kind, setKind] = useState<ScheduleKind>(schedule.kind)
  const [enabled, setEnabled] = useState(schedule.enabled)
  const [unit, setUnit] = useState<'seconds' | 'minutes' | 'hours'>(() => {
    const s = schedule.everySeconds ?? minSec
    if (s % 3600 === 0) return 'hours'
    if (s % 60 === 0) return 'minutes'
    return 'seconds'
  })
  const [amount, setAmount] = useState(() => {
    const s = schedule.everySeconds ?? minSec
    if (s % 3600 === 0) return s / 3600
    if (s % 60 === 0) return s / 60
    return s
  })
  const [days, setDays] = useState<number[]>(schedule.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7])
  const [hour, setHour] = useState(schedule.hour ?? 0)
  const [minute, setMinute] = useState(schedule.minute ?? 0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setKind(schedule.kind)
    setEnabled(schedule.enabled)
    const s = schedule.everySeconds ?? minSec
    if (s % 3600 === 0) {
      setUnit('hours')
      setAmount(s / 3600)
    } else if (s % 60 === 0) {
      setUnit('minutes')
      setAmount(s / 60)
    } else {
      setUnit('seconds')
      setAmount(s)
    }
    setDays(schedule.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7])
    setHour(schedule.hour ?? 0)
    setMinute(schedule.minute ?? 0)
    setMsg(null)
  }, [schedule, minSec])

  const everySeconds =
    unit === 'hours' ? amount * 3600 : unit === 'minutes' ? amount * 60 : amount

  const draft = {
    kind,
    enabled,
    everySeconds,
    daysOfWeek: days,
    hour,
    minute,
  }

  const title = schedule.flow === 'orders' ? 'Опитування замовлень' : 'Пересборка фіду'

  async function save() {
    if (!isOwner) return
    setBusy(true)
    setMsg(null)
    try {
      const body =
        kind === 'INTERVAL'
          ? { kind, enabled, everySeconds }
          : { kind, enabled, daysOfWeek: days, hour, minute }
      const mp = await api.putIntegrationSchedule(marketplaceId, schedule.flow, body)
      onSaved(mp)
      setMsg('Збережено')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Помилка збереження')
    } finally {
      setBusy(false)
    }
  }

  async function runNow() {
    if (!isOwner) return
    setBusy(true)
    setMsg(null)
    try {
      await api.triggerJob(schedule.triggerName)
      setMsg('Запущено зараз')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не вдалося запустити')
    } finally {
      setBusy(false)
    }
  }

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-[var(--text-secondary)]">{previewLabel(draft)}</div>
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!isOwner}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Увімкнено
      </label>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant={kind === 'INTERVAL' ? 'primary' : 'secondary'}
          disabled={!isOwner}
          onClick={() => setKind('INTERVAL')}
        >
          Інтервал
        </Button>
        <Button
          variant={kind === 'CALENDAR' ? 'primary' : 'secondary'}
          disabled={!isOwner}
          onClick={() => setKind('CALENDAR')}
        >
          За календарем
        </Button>
      </div>

      {kind === 'INTERVAL' ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span>Кожні</span>
          <Input
            type="number"
            min={1}
            className="w-24"
            disabled={!isOwner}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          />
          <Select
            disabled={!isOwner}
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
        <div className="mb-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((name, i) => {
              const d = i + 1
              const on = days.includes(d)
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!isOwner}
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
              disabled={!isOwner}
              value={hour}
              onChange={(e) => setHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
            />
            <span>:</span>
            <Input
              type="number"
              min={0}
              max={59}
              className="w-20"
              disabled={!isOwner}
              value={minute}
              onChange={(e) => setMinute(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
            />
            <span className="text-[var(--text-secondary)]">Europe/Kyiv</span>
          </div>
        </div>
      )}

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => void save()}>
            Зберегти
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void runNow()}>
            Запустити зараз
          </Button>
          {msg ? <span className="text-sm text-[var(--text-secondary)]">{msg}</span> : null}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">Змінювати розклад може лише власник.</p>
      )}
    </div>
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
    void api.me().then(setMe).catch(() => setMe(null))
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
                      <option key={m} value={m} disabled={WRITE_MODES.indexOf(m) > WRITE_MODES.indexOf(maxMode)}>
                        {m}
                        {WRITE_MODES.indexOf(m) > WRITE_MODES.indexOf(maxMode) ? ' (потрібен вищий ceiling)' : ''}
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
            {modeMsg ? (
              <p className="text-xs text-[var(--text-secondary)]">{modeMsg}</p>
            ) : null}
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
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Коли CRM опитує замовлення і пересобирає файл фіду. Частоту скачування фіду задає кабінет
            площадки — тут її не змінюємо.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {(['orders', 'feed'] as ScheduleFlow[]).map((flow) => {
              const schedule = schedules.find((s) => s.flow === flow)
              if (!schedule) return null
              return (
                <ScheduleEditor
                  key={`${mp.id}-${flow}`}
                  marketplaceId={mp.id}
                  schedule={schedule}
                  isOwner={!!isOwner}
                  onSaved={replaceMarketplace}
                />
              )
            })}
          </div>
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
