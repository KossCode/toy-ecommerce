import { NavLink, Outlet } from 'react-router-dom'

const primaryNav = [
  { to: '/', label: 'Огляд', end: true },
  { to: '/orders', label: 'Замовлення', badge: 2 },
  { to: '/products', label: 'Товари' },
  { to: '/categories', label: 'Категорії' },
  { to: '/stock', label: 'Наявність' },
  { to: '/prices', label: 'Ціни' },
  { to: '/integrations', label: 'Інтеграції' },
]

const secondaryNav = [
  { to: '/customers', label: 'Клієнти' },
  { to: '/promotions', label: 'Акції' },
  { to: '/analytics', label: 'Аналітика' },
  { to: '/content', label: 'Контент' },
]

function NavItem({
  to,
  label,
  end,
  badge,
}: {
  to: string
  label: string
  end?: boolean
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
          isActive
            ? 'bg-[#e4f1ef] font-semibold text-[var(--primary)] before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r before:bg-[var(--primary)]'
            : 'text-[var(--text)] hover:bg-[var(--bg)]'
        }`
      }
    >
      <span>{label}</span>
      {badge ? (
        <span className="rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </NavLink>
  )
}

export function CrmLayout() {
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 flex h-screen w-[var(--sidebar)] shrink-0 flex-col border-r border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <div className="text-sm font-bold tracking-wide">
            <span className="text-[#e8b84a]">TRIO</span>
            <span className="text-[#e07a6a]">♥</span>
            <span className="text-[#6a9fd8]">MIO</span>
          </div>
          <div className="text-xs text-[var(--text-secondary)]">CRM</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-auto p-2">
          {primaryNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <div className="my-2 border-t border-[var(--border)]" />
          {secondaryNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="border-t border-[var(--border)] p-2">
          <NavItem to="/settings" label="Налаштування" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-[var(--border)] bg-white px-6">
          <input
            className="h-9 w-full max-w-xl rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none focus:border-[var(--primary)]"
            placeholder="Пошук замовлення або артикула"
          />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="font-medium">Олена</span>
            <button type="button" className="text-[var(--text-secondary)] hover:text-[var(--text)]">
              Вийти
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
