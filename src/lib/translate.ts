/**
 * Free UA↔RU translation for CRM product texts.
 * Uses MyMemory (no API key, CORS-friendly). HTML tags are kept:
 * only text nodes are translated so lists/paragraphs survive.
 *
 * Short catalog values (країна, стан, матеріал…) go through a glossary first —
 * free MT often botches them (e.g. «Україна» → nonsense).
 */

const MYMEMORY = 'https://api.mymemory.translated.net/get'

export type LangPair = 'uk|ru' | 'ru|uk'

const CHUNK = 450

/** Exact UA → RU for typical product-card values. */
export const GLOSSARY_UK_RU: Record<string, string> = {
  Україна: 'Украина',
  Данія: 'Дания',
  Китай: 'Китай',
  Польща: 'Польша',
  Німеччина: 'Германия',
  Чехія: 'Чехия',
  Туреччина: 'Турция',
  США: 'США',
  Італія: 'Италия',
  Франція: 'Франция',
  Японія: 'Япония',
  Новий: 'Новый',
  Нова: 'Новая',
  Нове: 'Новое',
  Уживаний: 'Б/у',
  Пластик: 'Пластик',
  Дерево: 'Дерево',
  Текстиль: 'Текстиль',
  Метал: 'Металл',
  Гума: 'Резина',
  Пазл: 'Пазл',
  Конструктор: 'Конструктор',
  'М’яка іграшка': 'Мягкая игрушка',
  "М'яка іграшка": 'Мягкая игрушка',
  Базовий: 'Базовый',
  Червоний: 'Красный',
  Синій: 'Синий',
  Зелений: 'Зеленый',
  Жовтий: 'Желтый',
  Білий: 'Белый',
  Чорний: 'Черный',
  Рожевий: 'Розовый',
  Фіолетовий: 'Фиолетовый',
  Помаранчевий: 'Оранжевый',
  Коричневий: 'Коричневый',
  Сірий: 'Серый',
  'Без бренду': 'Без бренда',
  'Без бренда': 'Без бренда',
}

/** Phrase-level replacements inside longer strings (no \\b — breaks on Cyrillic). */
const PHRASE_UK_RU: [string, string][] = [
  ['Україна', 'Украина'],
  ['Данія', 'Дания'],
  ['Польща', 'Польша'],
  ['Німеччина', 'Германия'],
  ['років', 'лет'],
  ['року', 'года'],
  ['рік', 'год'],
  ['дітей', 'детей'],
  ['дитини', 'ребенка'],
  ['Від ', 'От '],
  ['від ', 'от '],
]

function glossaryExact(text: string): string | null {
  const t = text.trim()
  if (!t) return ''
  if (Object.prototype.hasOwnProperty.call(GLOSSARY_UK_RU, t)) {
    return GLOSSARY_UK_RU[t]
  }
  const lower = t.toLowerCase()
  for (const [uk, ru] of Object.entries(GLOSSARY_UK_RU)) {
    if (uk.toLowerCase() === lower) return ru
  }
  return null
}

function applyPhrases(text: string): string {
  let out = text
  for (const [uk, ru] of PHRASE_UK_RU) {
    out = out.split(uk).join(ru)
  }
  return out
}

async function translatePlainChunk(text: string, pair: LangPair): Promise<string> {
  const url = `${MYMEMORY}?q=${encodeURIComponent(text)}&langpair=${pair}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Переклад недоступний (${res.status})`)
  const data = (await res.json()) as {
    responseStatus?: number
    responseData?: { translatedText?: string }
    quotaFinished?: boolean
  }
  if (data.quotaFinished) {
    throw new Error('Ліміт безкоштовного перекладу вичерпано. Спробуйте пізніше або введіть вручну.')
  }
  const out = data.responseData?.translatedText
  if (!out || (data.responseStatus && data.responseStatus !== 200)) {
    throw new Error('Не вдалося отримати переклад')
  }
  if (/QUERY LENGTH LIMIT/i.test(out)) {
    throw new Error('Текст задовгий для одного запиту — розбийте опис на коротші абзаци')
  }
  return out
}

async function translatePlain(text: string, pair: LangPair): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (pair === 'uk|ru') {
    const hit = glossaryExact(trimmed)
    if (hit !== null) return hit
  }

  if (text.length <= CHUNK) {
    const raw = await translatePlainChunk(text, pair)
    return pair === 'uk|ru' ? applyPhrases(raw) : raw
  }

  const pieces: string[] = []
  let buf = ''
  const parts = text.split(/(\n+|(?<=[.!?…])\s+)/)
  for (const part of parts) {
    if ((buf + part).length > CHUNK && buf.trim()) {
      pieces.push(buf)
      buf = part
    } else {
      buf += part
    }
  }
  if (buf) pieces.push(buf)

  const translated: string[] = []
  for (const piece of pieces) {
    if (!piece.trim()) {
      translated.push(piece)
      continue
    }
    const hit = pair === 'uk|ru' ? glossaryExact(piece.trim()) : null
    if (hit !== null) {
      const lead = piece.match(/^\s*/)?.[0] ?? ''
      const trail = piece.match(/\s*$/)?.[0] ?? ''
      translated.push(lead + hit + trail)
      continue
    }
    const raw = await translatePlainChunk(piece, pair)
    translated.push(pair === 'uk|ru' ? applyPhrases(raw) : raw)
  }
  return translated.join('')
}

/**
 * Translate HTML-ish / plain product description while preserving tags.
 * Allowed Epicentr subset (p, br, b, ul, ol, li, table…) stays intact.
 */
export async function translatePreservingFormat(
  source: string,
  pair: LangPair = 'uk|ru',
): Promise<string> {
  if (!source.trim()) return ''

  if (pair === 'uk|ru') {
    const hit = glossaryExact(source)
    if (hit !== null) return hit
  }

  const hasTags = /<\/?[a-z][\s\S]*>/i.test(source)
  if (!hasTags) {
    return translatePlain(source, pair)
  }

  const tokens = source.split(/(<[^>]+>)/)
  const out: string[] = []

  for (const token of tokens) {
    if (!token) continue
    if (token.startsWith('<') && token.endsWith('>')) {
      out.push(token)
      continue
    }
    if (!token.trim()) {
      out.push(token)
      continue
    }
    const lead = token.match(/^\s*/)?.[0] ?? ''
    const trail = token.match(/\s*$/)?.[0] ?? ''
    const core = token.slice(lead.length, token.length - trail.length)
    const translated = core ? await translatePlain(core, pair) : ''
    out.push(lead + translated + trail)
  }

  return out.join('')
}

export async function translateUkToRu(source: string): Promise<string> {
  return translatePreservingFormat(source, 'uk|ru')
}

/** Sync helper for seed / offline: glossary + phrase pass, no network. */
export function guessRuFromUa(source: string): string {
  if (!source.trim()) return ''
  const hit = glossaryExact(source)
  if (hit !== null) return hit
  return applyPhrases(source)
}
