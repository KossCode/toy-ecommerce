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
