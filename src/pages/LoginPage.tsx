import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import { Button, Input } from '@/components/ui'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const me = await api.login(email.trim(), password)
      if (me.mustChangePassword) {
        navigate('/change-password', { replace: true })
        return
      }
      const raw = params.get('next') || '/'
      const path = raw.startsWith('#') ? raw.slice(1) || '/' : raw
      navigate(path.startsWith('/') ? path : `/${path}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося увійти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-[400px]">
        <form
          onSubmit={onSubmit}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 shadow-sm"
        >
          <div className="mb-6 text-center">
            <div className="text-lg font-bold tracking-wide">
              <span className="text-[#e8b84a]">TRIO</span>
              <span className="text-[#e07a6a]">♥</span>
              <span className="text-[#6a9fd8]">MIO</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)]">CRM</div>
            <h1 className="mt-4 text-xl font-semibold text-[var(--text)]">Вхід</h1>
          </div>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Email</span>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="mb-2 block text-sm">
            <span className="mb-1 block text-[var(--text-secondary)]">Пароль</span>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={error ? 'border-[var(--error)] pr-16' : 'pr-16'}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-2 text-xs text-[var(--primary)]"
                onClick={() => setShow((v) => !v)}
              >
                {show ? 'Сховати' : 'Показати'}
              </button>
            </div>
          </label>
          {error ? <p className="mb-3 text-sm text-[var(--error)]">{error}</p> : null}
          <Button type="submit" className="mt-2 w-full" disabled={busy}>
            {busy ? 'Вхід…' : 'Увійти'}
          </Button>
          <button
            type="button"
            className="mt-3 w-full cursor-default text-center text-sm text-[var(--text-secondary)] opacity-60"
            disabled
            title="Відновлення пароля — у власника в «Налаштуваннях»"
          >
            Забули пароль?
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-[var(--text-secondary)]">
          Доступ лише для працівників магазину.
        </p>
      </div>
    </div>
  )
}
