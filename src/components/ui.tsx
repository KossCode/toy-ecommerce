import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function StatusChip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary'
}) {
  const map = {
    success: 'bg-[#e8f5ec] text-[var(--success)]',
    warning: 'bg-[#fff4e5] text-[var(--warning)]',
    error: 'bg-[#fdecea] text-[var(--error)]',
    info: 'bg-[#e8f2f8] text-[var(--info)]',
    neutral: 'bg-[#eef0f3] text-[var(--neutral)]',
    primary: 'bg-[#e4f1ef] text-[var(--primary)]',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[tone]}`}>
      {children}
    </span>
  )
}

export function chipTone(label: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' {
  if (['Активний', 'Активна', 'Працює', 'Доставлено', 'В наявності'].includes(label)) return 'success'
  if (['Нове', 'На модерації', 'Під замовлення', 'Очікується'].includes(label)) return 'info'
  if (['Є питання', 'Закінчується', 'Часткова', '1 помилка', 'Не готовий'].some((x) => label.includes(x)))
    return 'warning'
  if (['Помилка', 'Скасовано', 'Немає в наявності', 'Вимкнено'].some((x) => label.includes(x)))
    return 'error'
  if (['Відправлено', 'Підтверджено'].includes(label)) return 'primary'
  return 'neutral'
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'destructive'
}) {
  const styles = {
    primary:
      'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50',
    secondary:
      'bg-white border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg)]',
    quiet: 'bg-transparent text-[var(--primary)] hover:underline px-2',
    destructive: 'bg-[var(--error)] text-white hover:opacity-90',
  }
  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-[var(--radius)] px-3 text-sm font-medium transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 outline-none focus:border-[var(--primary)] ${className}`}
      {...props}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="min-h-28 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
      {...props}
    />
  )
}

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] ${className}`}>
      {title ? (
        <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">{title}</header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {meta ? <div className="mt-1 text-sm text-[var(--text-secondary)]">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StockDot({ label }: { label: string }) {
  const color =
    label === 'В наявності'
      ? 'bg-[var(--success)]'
      : label === 'Закінчується' || label === 'Очікується'
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--error)]'
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
