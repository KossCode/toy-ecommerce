/** Safe return path from `location.state.from` (internal routes only). */
export function navBackFrom(
  state: unknown,
  fallback: string,
): { to: string; label: string } {
  const raw =
    state && typeof state === 'object' && 'from' in state
      ? String((state as { from?: unknown }).from ?? '')
      : ''
  const to = raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback
  let label = 'Назад'
  if (to.startsWith('/integrations')) label = 'Інтеграції'
  else if (to.startsWith('/orders')) label = 'Замовлення'
  else if (to.startsWith('/products')) label = 'Товари'
  else if (to.startsWith('/categories')) label = 'Категорії'
  else if (to.startsWith('/prices')) label = 'Ціни'
  else if (to === '/' || to === '') label = 'Огляд'
  return { to, label }
}
