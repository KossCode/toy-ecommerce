import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type IntegrationsFile } from '@/api/client'
import { Button, PageHeader, Panel, StatusChip, chipTone } from '@/components/ui'

export function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsFile | null>(null)
  const [active, setActive] = useState('epicentr')
  const [error, setError] = useState<string | null>(null)

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
  }, [])

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!data) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  const mp = data.marketplaces.find((m) => m.id === active) ?? data.marketplaces[0]

  return (
    <div>
      <PageHeader title="Інтеграції" />

      <div className="mb-4 flex flex-wrap gap-2">
        {data.marketplaces.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setActive(m.id)}
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

      <div className="grid gap-4 lg:grid-cols-2">
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
            {mp.connection.tokenMasked ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Токен API</dt>
                <dd>
                  {String(mp.connection.tokenMasked)}{' '}
                  <Button variant="quiet">Замінити</Button>
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
                  <Button variant="quiet">Змінити</Button>
                </dd>
              </div>
            ) : null}
            {mp.connection.feedUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Посилання на фід</dt>
                <dd className="flex items-center gap-2">
                  <code className="text-xs">{String(mp.connection.feedUrl)}</code>
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
              {(mp.connection.capabilities as string[]).map((c) => (
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

      <details className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer text-[var(--text-secondary)]">
          Показати технічні деталі
        </summary>
        <p className="mt-2 text-[var(--text-secondary)]">Журнал запитів (мок) — згорнуто за замовчуванням.</p>
      </details>
    </div>
  )
}
