import { useEffect, useState } from 'react'
import { api, type CrmUser, type Me } from '@/api/client'
import { Button, Input, PageHeader, Panel, Select, StatusChip } from '@/components/ui'

export function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [users, setUsers] = useState<CrmUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'OWNER' | 'MANAGER'>('MANAGER')
  const [busy, setBusy] = useState(false)
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null)

  const isOwner = me?.role === 'OWNER'

  async function load() {
    try {
      const user = await api.me()
      setMe(user)
      if (user.role === 'OWNER') {
        setUsers(await api.getUsers())
      } else {
        setUsers([])
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function invite() {
    if (!isOwner) return
    setBusy(true)
    setMsg(null)
    setIssuedPassword(null)
    try {
      const res = await api.createUser({ email, fullName, role })
      setIssuedPassword(res.temporaryPassword)
      setInviteOpen(false)
      setEmail('')
      setFullName('')
      setRole('MANAGER')
      await load()
      setMsg('Користувача створено — скопіюйте тимчасовий пароль')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(id: number) {
    if (!isOwner) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.resetUserPassword(id)
      setIssuedPassword(res.temporaryPassword)
      setMsg('Пароль скинуто — скопіюйте тимчасовий пароль')
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(u: CrmUser) {
    if (!isOwner) return
    setBusy(true)
    setMsg(null)
    try {
      await api.patchUser(u.id, { active: !u.active })
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="text-[var(--error)]">{error}</p>
  if (!me) return <p className="text-[var(--text-secondary)]">Завантаження…</p>

  return (
    <div>
      <PageHeader
        title="Налаштування"
        actions={
          isOwner ? (
            <Button onClick={() => setInviteOpen((v) => !v)}>Запросити користувача</Button>
          ) : null
        }
      />

      {!isOwner ? (
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Перегляд користувачів доступний лише власнику. Зверніться до власника для змін доступу.
        </p>
      ) : null}

      {issuedPassword ? (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--warning)]/40 bg-[#fff8e8] px-4 py-3 text-sm">
          Тимчасовий пароль (показується один раз):{' '}
          <code className="font-semibold">{issuedPassword}</code>{' '}
          <Button
            variant="quiet"
            onClick={() => void navigator.clipboard.writeText(issuedPassword)}
          >
            Копіювати
          </Button>
        </div>
      ) : null}

      {msg ? <p className="mb-3 text-sm text-[var(--text-secondary)]">{msg}</p> : null}

      {inviteOpen && isOwner ? (
        <Panel title="Новий користувач" className="mb-4">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-[var(--text-secondary)]">Імʼя</span>
              <Input className="mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="text-[var(--text-secondary)]">Email</span>
              <Input
                className="mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--text-secondary)]">Роль</span>
              <Select
                className="mt-1 w-full"
                value={role}
                onChange={(e) => setRole(e.target.value as 'OWNER' | 'MANAGER')}
              >
                <option value="MANAGER">Менеджер</option>
                <option value="OWNER">Власник</option>
              </Select>
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="quiet" onClick={() => setInviteOpen(false)}>
              Скасувати
            </Button>
            <Button
              disabled={busy || !email.trim() || !fullName.trim()}
              onClick={() => void invite()}
            >
              Створити
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Користувачі">
        {users.length === 0 && !isOwner ? (
          <p className="text-sm text-[var(--text-secondary)]">Немає доступу до списку.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="pb-2 font-medium">Імʼя</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Роль</th>
                <th className="pb-2 font-medium">Статус</th>
                <th className="pb-2 font-medium">Останній вхід</th>
                {isOwner ? <th className="pb-2 text-right font-medium">Дії</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5 font-medium">{u.fullName}</td>
                  <td className="py-2.5">{u.email}</td>
                  <td className="py-2.5">
                    {u.role === 'OWNER' ? 'Власник' : 'Менеджер'}
                  </td>
                  <td className="py-2.5">
                    <StatusChip tone={u.active ? 'success' : 'neutral'}>
                      {u.active ? 'Активний' : 'Вимкнено'}
                    </StatusChip>
                  </td>
                  <td className="py-2.5 text-[var(--text-secondary)]">
                    {u.lastLoginAt ? String(u.lastLoginAt).replace('T', ' ').slice(0, 16) : '—'}
                  </td>
                  {isOwner ? (
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="quiet"
                          disabled={busy || u.id === me.id}
                          onClick={() => void resetPassword(u.id)}
                        >
                          Скинути пароль
                        </Button>
                        <Button
                          variant="quiet"
                          disabled={busy || u.id === me.id}
                          onClick={() => void toggleActive(u)}
                        >
                          {u.active ? 'Вимкнути' : 'Увімкнути'}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Власник — налаштування, ціни, ключі площадок. Менеджер — замовлення, товари, наявність.
        </p>
      </Panel>
    </div>
  )
}
