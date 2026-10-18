/** Mock rules for marketplace text fields (length + allowed/forbidden characters). */

export type MarketplaceId = 'rozetka' | 'epicentr' | 'prom'

export type FieldRule = {
  max: number
  /** Human-readable allowed set */
  allowedHint: string
  /** Characters that must not appear */
  forbidden: RegExp
  forbiddenHint: string
}

export const NAME_RULES: Record<MarketplaceId, FieldRule> = {
  rozetka: {
    max: 150,
    allowedHint: 'літери, цифри, пробіл, «»""\'.,;:!?()-–—/%+№',
    forbidden: /[^\p{L}\p{N}\s«»""'„“.,;:!?()\-–—/%+№]/gu,
    forbiddenHint: 'емодзі та спецсимволи (напр. ★ ❤ ©)',
  },
  epicentr: {
    max: 120,
    allowedHint: 'літери, цифри, пробіл, базові розділові',
    forbidden: /[^\p{L}\p{N}\s«»""'.,;:!?()\-–—/%+]/gu,
    forbiddenHint: 'емодзі, №, та інші спецзнаки',
  },
  prom: {
    max: 255,
    allowedHint: 'літери, цифри, пробіл, більшість розділових',
    forbidden: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
    forbiddenHint: 'емодзі та піктограми',
  },
}

export const DESCRIPTION_RULES: Record<MarketplaceId, FieldRule> = {
  rozetka: {
    max: 5000,
    allowedHint: 'текст + базова розмітка',
    forbidden: /[\u{1F300}-\u{1FAFF}]/gu,
    forbiddenHint: 'емодзі',
  },
  epicentr: {
    max: 12160,
    allowedHint: 'абзаци, жирний, списки, таблиці (решта HTML відсікається)',
    forbidden: /<(?!\/?(p|br|b|strong|ul|ol|li|table|tr|td|th|thead|tbody)\b)[^>]+>/gi,
    forbiddenHint: 'теги поза списком Epicentr (script, iframe, style…)',
  },
  prom: {
    max: 10000,
    allowedHint: 'текст без емодзі',
    forbidden: /[\u{1F300}-\u{1FAFF}]/gu,
    forbiddenHint: 'емодзі',
  },
}

export type FieldCheck = {
  id: MarketplaceId
  label: string
  ok: boolean
  issues: string[]
}

function checkRule(value: string, rule: FieldRule): string[] {
  const issues: string[] = []
  if (value.length > rule.max) {
    issues.push(`довжина ${value.length} > ${rule.max}`)
  }
  const bad = value.match(rule.forbidden)
  if (bad?.length) {
    const sample = [...new Set(bad)].slice(0, 5).join(' ')
    issues.push(`${rule.forbiddenHint}${sample ? `: ${sample}` : ''}`)
  }
  return issues
}

const LABELS: Record<MarketplaceId, string> = {
  rozetka: 'Rozetka',
  epicentr: 'Epicentr',
  prom: 'Prom',
}

export function checkNameForMarketplaces(name: string): FieldCheck[] {
  return (Object.keys(NAME_RULES) as MarketplaceId[]).map((id) => {
    const issues = checkRule(name, NAME_RULES[id])
    return { id, label: LABELS[id], ok: issues.length === 0, issues }
  })
}

export function checkDescriptionForMarketplaces(description: string): FieldCheck[] {
  return (Object.keys(DESCRIPTION_RULES) as MarketplaceId[]).map((id) => {
    const issues = checkRule(description, DESCRIPTION_RULES[id])
    return { id, label: LABELS[id], ok: issues.length === 0, issues }
  })
}
