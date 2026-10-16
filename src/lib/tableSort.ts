import { useState } from 'react'

export type SortDir = 'asc' | 'desc'

export function useTableSort<K extends string>(defaultKey: K, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<K>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  function toggle(key: K) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return { sortKey, sortDir, toggle }
}

export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: SortDir) {
  const av = a ?? ''
  const bv = b ?? ''
  let cmp = 0
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
  else cmp = String(av).localeCompare(String(bv), 'uk', { numeric: true, sensitivity: 'base' })
  return dir === 'asc' ? cmp : -cmp
}
