import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import { Button, Input } from '@/components/ui'

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.changePassword(currentPassword, newPassword)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося змінити пароль')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--bg)] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[400px] rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 shadow-sm"
      >
        <h1 className="mb-2 text-xl font-semibold">Зміна пароля</h1>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">
          Тимчасовий пароль потрібно змінити перед роботою в CRM.
        </p>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Поточний пароль</span>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Новий пароль (мін. 12)</span>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
            minLength={12}
            required
          />
        </label>
        {error ? <p className="mb-3 text-sm text-[var(--error)]">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Зберегти
        </Button>
      </form>
    </div>
  )
}
