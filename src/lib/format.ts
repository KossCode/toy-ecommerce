export function money(n: number) {
  return `${n.toLocaleString('uk-UA')} грн`
}

export function formatDateTime(iso: string) {
  const d = new Date(iso)
  const day = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

export function formatDateLong(iso: string) {
  return new Date(iso).toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
