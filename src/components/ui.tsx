import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'

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
  if (['Чернетка'].includes(label)) return 'neutral'
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

export function Textarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-28 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 ${className}`}
      {...props}
    />
  )
}

export function Panel({
  title,
  children,
  className = '',
}: {
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
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
  backTo,
  backLabel = 'Назад',
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  /** Internal path to return to (e.g. `/integrations/prom`). */
  backTo?: string
  backLabel?: string
}) {
  return (
    <div className="mb-5">
      {backTo ? (
        <Link
          to={backTo}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-[var(--primary)] hover:underline"
        >
          <span aria-hidden className="text-base leading-none">
            ←
          </span>
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {meta ? <div className="mt-1 text-sm text-[var(--text-secondary)]">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

/** Unified tabs + field filters above list tables. */
export function ListFilters({
  tabs,
  children,
  footer,
}: {
  tabs?: ReactNode
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mb-3 rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[0_1px_0_rgba(16,24,40,0.03)]">
      {tabs ? (
        <div className="flex flex-wrap gap-1 border-b border-[var(--border)] px-3 py-2">{tabs}</div>
      ) : null}
      {children ? (
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">{children}</div>
      ) : null}
      {footer ? (
        <div className="border-t border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-[var(--primary)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}

export function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = 'left',
  className = '',
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th className={`px-3 py-2 font-medium ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-[var(--text)] ${
          active ? 'text-[var(--text)]' : ''
        }`}
      >
        {label}
        <span className="text-[10px] opacity-70" aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
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
