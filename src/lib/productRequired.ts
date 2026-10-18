/**
 * Fields required on our product card = union of fields that are
 * mandatory on at least one of Rozetka / Prom / Epicentr for publication.
 * Drafts may stay empty; readiness checklist uses these for sync gates.
 */
import type { Product } from '@/api/client'

export type RequiredFieldId =
  | 'name'
  | 'nameRu'
  | 'description'
  | 'descriptionRu'
  | 'photos'
  | 'category'
  | 'brand'
  | 'price'
  | 'stock'

export type RequiredFieldDef = {
  id: RequiredFieldId
  label: string
  /** Why it is required on our card */
  reason: string
  marketplaces: ('Rozetka' | 'Prom' | 'Epicentr')[]
}

export const REQUIRED_FIELDS: RequiredFieldDef[] = [
  {
    id: 'name',
    label: 'Назва (UA)',
    reason: 'name_ua / name lang=ua',
    marketplaces: ['Rozetka', 'Prom', 'Epicentr'],
  },
  {
    id: 'nameRu',
    label: 'Назва (RU)',
    reason: 'Rozetka вимагає російську <name>; Prom — name разом з description',
    marketplaces: ['Rozetka', 'Prom'],
  },
  {
    id: 'description',
    label: 'Опис (UA)',
    reason: 'description_ua / description lang=ua',
    marketplaces: ['Rozetka', 'Prom', 'Epicentr'],
  },
  {
    id: 'descriptionRu',
    label: 'Опис (RU)',
    reason: 'Rozetka вимагає російський description; Prom — description обовʼязковий',
    marketplaces: ['Rozetka', 'Prom'],
  },
  {
    id: 'photos',
    label: 'Фото',
    reason: 'Мін. 1 фото на всіх майданчиках',
    marketplaces: ['Rozetka', 'Prom', 'Epicentr'],
  },
  {
    id: 'category',
    label: 'Категорія',
    reason: 'Листова категорія + мапінг на майданчик',
    marketplaces: ['Rozetka', 'Prom', 'Epicentr'],
  },
  {
    id: 'brand',
    label: 'Бренд',
    reason: 'Rozetka vendor (або «Без бренду»); Epicentr param brand',
    marketplaces: ['Rozetka', 'Epicentr'],
  },
  {
    id: 'price',
    label: 'Ціна',
    reason: 'price на всіх майданчиках',
    marketplaces: ['Rozetka', 'Prom', 'Epicentr'],
  },
  {
    id: 'stock',
    label: 'Кількість / наявність',
    reason: 'stock_quantity / quantity_in_stock; Epicentr — статус наявності',
    marketplaces: ['Rozetka', 'Prom', 'Epicentr'],
  },
]

export type FieldFill = { id: RequiredFieldId; ok: boolean; hint?: string }

/** Soft photo check for MVP mock (no real uploads yet). */
export function checkRequiredFields(
  product: Pick<
    Product,
    | 'name'
    | 'nameRu'
    | 'description'
    | 'descriptionRu'
    | 'category'
    | 'brand'
    | 'price'
    | 'available'
    | 'total'
    | 'awaiting'
  > & { photoCount?: number },
): FieldFill[] {
  const photoCount = product.photoCount ?? 1 // mock: UI always shows placeholders
  return [
    { id: 'name', ok: Boolean(product.name?.trim()) },
    { id: 'nameRu', ok: Boolean(product.nameRu?.trim()) },
    { id: 'description', ok: Boolean(product.description?.trim()) },
    { id: 'descriptionRu', ok: Boolean(product.descriptionRu?.trim()) },
    {
      id: 'photos',
      ok: photoCount >= 1,
      hint: photoCount < 1 ? 'Додайте хоча б одне фото' : undefined,
    },
    { id: 'category', ok: Boolean(product.category?.trim()) },
    {
      id: 'brand',
      ok: Boolean(product.brand?.trim()),
      hint: !product.brand?.trim()
        ? 'Вкажіть бренд або «Без бренду»'
        : undefined,
    },
    { id: 'price', ok: Number(product.price) > 0 },
    {
      id: 'stock',
      ok: product.awaiting === true || Number(product.total) >= 0,
      hint: undefined,
    },
  ]
}

export function missingRequiredLabels(fills: FieldFill[]): string[] {
  const byId = new Map(REQUIRED_FIELDS.map((f) => [f.id, f]))
  return fills
    .filter((f) => !f.ok)
    .map((f) => byId.get(f.id)?.label ?? f.id)
}
