export function money(n: number) {
  const hasCents = Math.round(n * 100) % 100 !== 0
  return `${n.toLocaleString('uk-UA', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })} грн`
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
