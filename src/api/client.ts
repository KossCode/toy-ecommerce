import { browserApi } from './browserStore'

const useBrowserApi =
  import.meta.env.VITE_USE_BROWSER_API === 'true' || import.meta.env.PROD

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

const httpApi = {
  getOverview: () => request<OverviewPayload>('/overview'),
  getProducts: () => request<Product[]>('/products'),
  getProduct: (sku: string) => request<Product>(`/products/${sku}`),
  patchProduct: (sku: string, body: Partial<Product>) =>
    request<Product>(`/products/${sku}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getProductHistory: (sku: string) =>
    request<ProductHistoryItem[]>(`/products/${sku}/history`),
  getOrders: () => request<OrderListItem[]>('/orders'),
  getOrder: (id: string) => request<OrderDetail>(`/orders/${id}`),
  createOrder: (body: CreateOrderBody) =>
    request<Order>(`/orders`, { method: 'POST', body: JSON.stringify(body) }),
  confirmOrder: (id: string) =>
    request<Order>(`/orders/${id}/confirm`, { method: 'POST', body: '{}' }),
  cancelOrder: (id: string, reason: string) =>
    request<Order>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getIntegrations: () => request<IntegrationsFile>('/integrations'),
  retryIntegration: (id: string) =>
    request<IntegrationsFile['marketplaces'][0]>(`/integrations/${id}/retry`, {
      method: 'POST',
      body: '{}',
    }),
  getCategories: () => request<CategoriesFile>('/categories'),
  createCategory: (body: { name: string; parentId?: string | null }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(body) }),
  patchCategory: (
    id: string,
    body: Partial<Pick<Category, 'name' | 'parentId'>> & {
      mappings?: Partial<Category['mappings']>
    },
  ) => request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  refreshCategoryDictionaries: () =>
    request<CategoriesFile>('/categories/refresh-dictionaries', {
      method: 'POST',
      body: '{}',
    }),
  getPrices: () => request<PricesFile>('/prices'),
  previewPriceRule: (
    body: Partial<PriceRule> &
      Pick<PriceRule, 'marketplace' | 'scope' | 'kind'> & { excludeId?: string },
  ) => request<PricePreview>('/prices/preview', { method: 'POST', body: JSON.stringify(body) }),
  createPriceRule: (body: Partial<PriceRule> & Pick<PriceRule, 'marketplace' | 'scope' | 'kind'>) =>
    request<PriceRule>('/prices', { method: 'POST', body: JSON.stringify(body) }),
  updatePriceRule: (
    id: string,
    body: Partial<PriceRule> & Pick<PriceRule, 'marketplace' | 'scope' | 'kind'>,
  ) => request<PriceRule>(`/prices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePriceRule: (id: string) =>
    request<{ ok: boolean }>(`/prices/${id}`, { method: 'DELETE' }),
}

export const api = useBrowserApi ? browserApi : httpApi

export type MarketplacePrice = {
  price: number
  oldPrice: number | null
  rule: string
}

export type Product = {
  sku: string
  name: string
  brand: string
  category: string
  status: string
  price: number
  oldPrice: number | null
  total: number
  reserve: number
  available: number
  stockLabel: string
  channels: Record<string, string>
  syncStatus: string
  syncHint?: string
  model: string
  barcode: string
  weightKg: number | null
  dimensionsCm: string
  country: string
  description: string
  brandMissing: boolean
  duplicateOf: string | null
  updatedAt: string
  updatedBy: string
  condition?: string
  color?: string
  ageGroup?: string
  material?: string
  type?: string
  partsCount?: number | null
  series?: string
  awaiting?: boolean
  marketplacePrices?: {
    rozetka: MarketplacePrice
    epicentr: MarketplacePrice
    prom: MarketplacePrice
  }
}

export type ProductHistoryItem = {
  at: string
  sku: string
  text: string
  who: string
  kind: string
}

export type Order = {
  id: string
  channel: string
  externalId: string | null
  createdAt: string
  customerName: string | null
  customerPhone: string | null
  city: string | null
  status: string
  confirmDeadlineMinutes: number | null
  delivery: string
  deliveryAddress: string | null
  payment: string
  ttn: string | null
  ttnStatus: string | null
  comment: string | null
  cancelReason: string | null
  items: { sku: string; name: string; qty: number; price: number; oldPrice: number | null }[]
  total: number
  history: { at: string; text: string; who: string }[]
}

export type OrderListItem = Order & {
  confirmLabel: string | null
  itemsLabel: string
}

export type OrderDetail = Order & {
  confirmLabel: string | null
  stock: { sku: string; available: number }[]
}

export type CreateOrderBody = {
  channel?: string
  customerName: string
  customerPhone?: string
  city?: string
  /** Carrier shown in the orders table: Нова Пошта | Міст Експрес */
  delivery?: string
  /** Branch / address / locker details */
  deliveryAddress?: string
  /** Відділення | Адреса — CRM label; maps to NP Warehouse* / Doors* later */
  deliveryType?: string
  /** Отримувач | Відправник — NP/Meest payerType */
  deliveryPayer?: string
  /**
   * Оплачено | Накладений платіж | Під час отримання | Карткою при отриманні
   * COD → післяплата on waybill when TTN is created (stage 5).
   */
  payment?: string
  comment?: string
  items: { sku: string; qty: number }[]
}

export type OverviewPayload = {
  meta: {
    user: { name: string; role: string }
    todayLabel: string
    counts: Record<string, number>
    overview: Record<string, string | number>
  }
  todo: {
    id: string
    channel: string
    customerName: string | null
    total: number
    status: string
    action: string
    actionKind: string
    urgent: boolean
  }[]
  integrations: {
    id: string
    name: string
    tabTone: string
    summary: string
    hasRetry: boolean
  }[]
  lowStockSample: { sku: string; name: string; available: number } | null
}

export type IntegrationsFile = {
  marketplaces: {
    id: string
    name: string
    tabLabel: string
    tabTone: string
    flows: { name: string; status: string; when: string; link?: string }[]
    ready: {
      ready: number
      total: number
      notReady: number
      reasons: { text: string; count: number }[]
    }
    connection: Record<string, unknown>
    errorBanner: { title: string; nextTry: string } | null
    moderationErrors: { sku: string; name: string; error: string; when: string }[]
  }[]
}

export type CategoryMapping = {
  leafId: string | null
  name: string | null
  secondary: string | null
}

export type Category = {
  id: string
  name: string
  parentId: string | null
  productCount: number
  sortOrder: number
  mappings: {
    rozetka: CategoryMapping
    epicentr: CategoryMapping
    prom: CategoryMapping
  }
}

export type MarketplaceLeaf = {
  id: string
  name: string
  attributeSet?: string
}

export type CategoriesFile = {
  meta: {
    topLevelCount: number
    productTotal: number
    dictionariesUpdatedAt: string
  }
  marketplaceLeaves: {
    rozetka: MarketplaceLeaf[]
    epicentr: MarketplaceLeaf[]
    prom: MarketplaceLeaf[]
  }
  categories: Category[]
}

export type PriceRule = {
  id: string
  marketplace: 'rozetka' | 'epicentr' | 'prom'
  marketplaceLabel: string
  scope: 'default' | 'category' | 'product'
  scopeLabel: string
  scopeLevel: string
  scopeValue: string | null
  kind: 'percent' | 'amount' | 'exact' | 'base'
  value: number | null
  ruleLabel: string
  rounding: 'none' | 'up_10' | 'down_10' | 'up_100' | 'down_100' | 'to_99'
  roundingLabel: string
  productCount: number
}

export type PricesFile = {
  meta: {
    ruleCount: number
    rozetkaThresholdNote: string
  }
  rules: PriceRule[]
}

export type PricePreview = {
  count: number
  jumps: number
  examples: { sku: string; name: string; base: number; before: number; after: number }[]
}
