import { browserApi } from './browserStore'

const useBrowserApi = import.meta.env.VITE_USE_BROWSER_API === 'true'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function readCookie(name: string): string | null {
  const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

let csrfReady: Promise<void> | null = null

async function ensureCsrf(): Promise<void> {
  if (readCookie('XSRF-TOKEN')) return
  if (!csrfReady) {
    csrfReady = fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(() => undefined)
  }
  await csrfReady
  csrfReady = null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (init?.body != null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    await ensureCsrf()
    const token = readCookie('XSRF-TOKEN')
    if (token) headers['X-XSRF-TOKEN'] = token
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
  })

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const next = encodeURIComponent(location.hash || '#/')
    location.hash = `#/login?next=${next}`
    throw new ApiError(401, 'Увійдіть, щоб продовжити.', 'UNAUTHORIZED')
  }

  if (res.status === 204) {
    return undefined as T
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      detail?: string
      title?: string
      error?: string
      code?: string
    }
    if (body.code === 'PASSWORD_CHANGE_REQUIRED') {
      location.hash = '#/change-password'
    }
    throw new ApiError(
      res.status,
      body.detail ?? body.title ?? body.error ?? res.statusText,
      body.code,
    )
  }

  if (res.headers.get('content-type')?.includes('json')) {
    return res.json() as Promise<T>
  }
  return undefined as T
}

export type Me = {
  id: number
  email: string
  fullName: string
  role: 'OWNER' | 'MANAGER'
  mustChangePassword: boolean
}

const httpApi = {
  login: (email: string, password: string) =>
    request<Me>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<Me>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<Me>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  getOverview: () => request<OverviewPayload>('/overview'),
  getProducts: () => request<Product[]>('/products'),
  getProduct: (sku: string) => request<Product>(`/products/${sku}`),
  createProduct: () => request<Product>('/products', { method: 'POST', body: '{}' }),
  patchProduct: (sku: string, body: Partial<Product>) =>
    request<Product>(`/products/${sku}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getProductHistory: (sku: string) => request<ProductHistoryItem[]>(`/products/${sku}/history`),
  getOrders: () => request<OrderListItem[]>('/orders'),
  getOrder: (id: string) => request<OrderDetail>(`/orders/${id}`),
  createOrder: (body: CreateOrderBody) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(body) }),
  confirmOrder: (id: string) =>
    request<Order>(`/orders/${id}/confirm`, { method: 'POST', body: '{}' }),
  createTtn: (id: string) => request<Order>(`/orders/${id}/ttn`, { method: 'POST', body: '{}' }),
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
  setIntegrationMode: (id: string, mode: IntegrationWriteMode) =>
    request<{ id: string; mode: string; effectiveMode: string; maxMode: string }>(
      `/integrations/${id}/mode`,
      { method: 'PATCH', body: JSON.stringify({ mode }) },
    ),
  putIntegrationSchedule: (id: string, flow: ScheduleFlow, body: ScheduleUpdateBody) =>
    request<IntegrationsFile['marketplaces'][0]>(`/integrations/${id}/schedules/${flow}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  triggerJob: (name: string) =>
    request<{ ok: string; name: string }>(`/jobs/${encodeURIComponent(name)}/trigger`, {
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
  nameRu: string
  descriptionRu: string
  countryRu: string
  brandMissing: boolean
  duplicateOf: string | null
  updatedAt: string
  updatedBy: string
  condition?: string
  conditionRu?: string
  color?: string
  colorRu?: string
  ageGroup?: string
  ageGroupRu?: string
  material?: string
  materialRu?: string
  type?: string
  typeRu?: string
  partsCount?: number | null
  series?: string
  seriesRu?: string
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
  warehouse?: string | null
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
  warehouse?: string
  delivery?: string
  deliveryAddress?: string
  deliveryType?: string
  deliveryPayer?: string
  payment?: string
  status?: 'Чернетка' | 'Нове' | 'Підтверджено'
  comment?: string
  items: { sku: string; qty: number; price?: number }[]
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

export type IntegrationWriteMode = 'OFF' | 'READ_ONLY' | 'DRY_RUN' | 'LIVE'
export type ScheduleFlow = 'orders' | 'feed'
export type ScheduleKind = 'INTERVAL' | 'CALENDAR'

export type IntegrationSchedule = {
  jobKey: string
  flow: ScheduleFlow
  kind: ScheduleKind
  enabled: boolean
  label: string
  triggerName: string
  everySeconds?: number
  daysOfWeek?: number[]
  hour?: number
  minute?: number
  /** HH:mm — only for INTERVAL when limited to a daily window */
  windowStart?: string
  windowEnd?: string
}

export type ScheduleUpdateBody = {
  kind: ScheduleKind
  enabled?: boolean
  everySeconds?: number
  daysOfWeek?: number[]
  hour?: number
  minute?: number
  windowStart?: string | null
  windowEnd?: string | null
}

export type IntegrationConnection = {
  mode?: IntegrationWriteMode | string
  maxMode?: IntegrationWriteMode | string
  effectiveMode?: IntegrationWriteMode | string
  feedUrl?: string
  tokenMasked?: string
  login?: string
  passwordMasked?: string
  priceSync?: string
  capabilities?: string[]
  caption?: string
  schedules?: IntegrationSchedule[]
  [key: string]: unknown
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
    connection: IntegrationConnection
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
