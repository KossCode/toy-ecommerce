export type ChannelStatus = string

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
  channels: Record<string, ChannelStatus>
  syncStatus: string
  syncHint?: string
  model: string
  barcode: string
  weightKg: number | null
  dimensionsCm: string
  country: string
  description: string
  epicentrName: string
  color: string
  ageGroup: string
  material: string
  type: string
  partsCount: number | null
  series: string
  condition: string
  updatedAt: string
  updatedBy: string
  duplicateOf: string | null
  brandMissing: boolean
  awaiting?: boolean
}

export type OrderItem = {
  sku: string
  name: string
  qty: number
  price: number
  oldPrice: number | null
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
  items: OrderItem[]
  total: number
  history: { at: string; text: string; who: string }[]
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
    moderationErrors: {
      sku: string
      name: string
      error: string
      when: string
    }[]
  }[]
}

export type Meta = {
  user: { name: string; role: string }
  todayLabel: string
  todayIso: string
  counts: Record<string, number>
  overview: Record<string, string | number>
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
