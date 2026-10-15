/**
 * In-browser mock for GitHub Pages (no Express). Seeded from data/*.json, persists in localStorage.
 */
import seedProducts from '../../data/products.json'
import seedOrders from '../../data/orders.json'
import seedIntegrations from '../../data/integrations.json'
import seedMeta from '../../data/meta.json'
import seedHistory from '../../data/product-history.json'
import type {
  CreateOrderBody,
  IntegrationsFile,
  Order,
  OrderDetail,
  OrderListItem,
  OverviewPayload,
  Product,
  ProductHistoryItem,
} from './client'

const STORAGE_KEY = 'triomio-crm-browser-v1'

type Store = {
  products: Product[]
  orders: Order[]
  integrations: IntegrationsFile
  meta: typeof seedMeta
  history: ProductHistoryItem[]
}

function nowIso() {
  return new Date().toISOString().slice(0, 19)
}

function formatDeadline(minutes: number | null) {
  if (minutes == null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `підтвердити за ${m} хв`
  return `підтвердити за ${h} год ${m} хв`
}

function recalcStock(product: Product) {
  product.available = Math.max(0, product.total - product.reserve)
  if (product.awaiting && product.available === 0) product.stockLabel = 'Очікується'
  else if (product.available === 0) product.stockLabel = 'Немає в наявності'
  else if (product.available <= 5) product.stockLabel = 'Закінчується'
  else product.stockLabel = 'В наявності'
}

function roundUpTo10(n: number) {
  return Math.ceil(n / 10) * 10
}

function marketplacePrices(product: Product) {
  const base = product.price
  const old = product.oldPrice
  const rozetka =
    product.brand === 'LEGO' ? roundUpTo10(base * 1.08) : roundUpTo10(base * 1.12)
  const epicentr = product.sku === 'TM-10188' ? 399 : roundUpTo10(base * 1.08)
  const rozetkaOld = old
    ? product.brand === 'LEGO'
      ? roundUpTo10(old * 1.08)
      : roundUpTo10(old * 1.12)
    : null
  const epicentrOld = old && product.sku !== 'TM-10188' ? roundUpTo10(old * 1.08) : old
  return {
    rozetka: {
      price: rozetka,
      oldPrice: rozetkaOld,
      rule: product.brand === 'LEGO' ? '+8%, вгору до 10' : '+12%, вгору до 10',
    },
    epicentr: {
      price: epicentr,
      oldPrice: epicentrOld,
      rule: product.sku === 'TM-10188' ? 'Точна ціна' : '+8%, вгору до 10',
    },
    prom: { price: base, oldPrice: old, rule: 'Як базова ціна' },
  }
}

function seed(): Store {
  return {
    products: structuredClone(seedProducts) as Product[],
    orders: structuredClone(seedOrders) as Order[],
    integrations: structuredClone(seedIntegrations) as IntegrationsFile,
    meta: structuredClone(seedMeta),
    history: structuredClone(seedHistory) as ProductHistoryItem[],
  }
}

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Store
  } catch {
    /* ignore */
  }
  const s = seed()
  saveStore(s)
  return s
}

function saveStore(s: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

let store = typeof localStorage !== 'undefined' ? loadStore() : seed()

function mutate(fn: (s: Store) => void) {
  fn(store)
  saveStore(store)
}

export const browserApi = {
  async getOverview(): Promise<OverviewPayload> {
    const { meta, orders, products, integrations } = store
    const todo = orders
      .filter((o) => o.status === 'Нове' || o.status === 'Підтверджено')
      .sort((a, b) => {
        const am = a.confirmDeadlineMinutes ?? 99999
        const bm = b.confirmDeadlineMinutes ?? 99999
        if (a.status === 'Нове' && b.status !== 'Нове') return -1
        if (b.status === 'Нове' && a.status !== 'Нове') return 1
        return am - bm
      })
      .slice(0, 4)
      .map((o) => ({
        id: o.id,
        channel: o.channel,
        customerName: o.customerName,
        total: o.total,
        status: o.status,
        action:
          o.status === 'Нове'
            ? formatDeadline(o.confirmDeadlineMinutes) ?? 'Підтвердити'
            : 'Створити накладну',
        actionKind: o.status === 'Нове' ? 'confirm' : 'ttn',
        urgent: o.status === 'Нове' && (o.confirmDeadlineMinutes ?? 9999) < 120,
      }))
    const low = products.find((p) => p.stockLabel === 'Закінчується')
    return {
      meta,
      todo,
      integrations: integrations.marketplaces.map((m) => ({
        id: m.id,
        name: m.name,
        tabTone: m.tabTone,
        summary:
          m.id === 'epicentr' && m.errorBanner
            ? 'Помилка о 09:12'
            : m.id === 'rozetka'
              ? 'Синхронізовано о 10:05 · 1 помилка модерації'
              : 'Синхронізовано о 10:05',
        hasRetry: Boolean(m.errorBanner),
      })),
      lowStockSample: low
        ? { sku: low.sku, name: low.name, available: low.available }
        : null,
    }
  },

  async getProducts() {
    return store.products
  },

  async getProduct(sku: string) {
    const product = store.products.find((p) => p.sku === sku)
    if (!product) throw new Error('Товар не знайдено')
    return { ...product, marketplacePrices: marketplacePrices(product) }
  },

  async patchProduct(sku: string, body: Partial<Product>) {
    let next: Product | null = null
    mutate((s) => {
      const idx = s.products.findIndex((p) => p.sku === sku)
      if (idx < 0) throw new Error('Товар не знайдено')
      const merged = { ...s.products[idx], ...body }
      if (typeof merged.total === 'number' && merged.total < merged.reserve) {
        throw new Error('Всього не може бути менше резерву')
      }
      merged.brandMissing = !merged.brand
      recalcStock(merged)
      merged.updatedAt = nowIso()
      merged.updatedBy = 'Олена'
      s.products[idx] = merged
      next = merged
    })
    return { ...next!, marketplacePrices: marketplacePrices(next!) }
  },

  async getProductHistory(sku: string) {
    return store.history.filter((h) => h.sku === sku)
  },

  async getOrders(): Promise<OrderListItem[]> {
    return store.orders.map((o) => ({
      ...o,
      confirmLabel: formatDeadline(o.confirmDeadlineMinutes),
      itemsLabel:
        o.items.length === 1
          ? `${o.items[0].sku} × ${o.items[0].qty}`
          : `${o.items.length} товари`,
    }))
  },

  async getOrder(id: string): Promise<OrderDetail> {
    const order = store.orders.find((o) => o.id === id)
    if (!order) throw new Error('Замовлення не знайдено')
    return {
      ...order,
      confirmLabel: formatDeadline(order.confirmDeadlineMinutes),
      stock: order.items.map((item) => {
        const p = store.products.find((x) => x.sku === item.sku)
        return { sku: item.sku, available: p?.available ?? 0 }
      }),
    }
  },

  async createOrder(body: CreateOrderBody) {
    let created: Order | null = null
    mutate((s) => {
      if (!body.customerName || !body.items?.length) {
        throw new Error('Потрібні клієнт і склад')
      }
      const maxNum = s.orders.reduce((max, o) => {
        const n = Number(o.id.replace('TM-', ''))
        return Number.isFinite(n) ? Math.max(max, n) : max
      }, 10482)
      const id = `TM-${maxNum + 1}`
      const orderItems = body.items.map((row) => {
        const p = s.products.find((x) => x.sku === row.sku)
        if (!p) throw new Error(`Немає товару ${row.sku}`)
        return {
          sku: p.sku,
          name: p.name,
          qty: row.qty,
          price: p.price,
          oldPrice: p.oldPrice,
        }
      })
      for (const row of orderItems) {
        const p = s.products.find((x) => x.sku === row.sku)!
        p.reserve += row.qty
        recalcStock(p)
      }
      const total = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0)
      const order: Order = {
        id,
        channel: body.channel ?? 'Instagram',
        externalId: null,
        createdAt: nowIso(),
        customerName: body.customerName,
        customerPhone: body.customerPhone ?? null,
        city: body.city ?? null,
        status: 'Підтверджено',
        confirmDeadlineMinutes: null,
        delivery: 'Нова Пошта',
        deliveryAddress: body.deliveryAddress ?? null,
        payment: body.payment ?? 'Під час отримання',
        ttn: null,
        ttnStatus: null,
        comment: body.comment ?? null,
        cancelReason: null,
        items: orderItems,
        total,
        history: [
          { at: nowIso(), text: `Створено вручну (${body.channel ?? 'Instagram'})`, who: 'Олена' },
          ...orderItems.map((i) => ({
            at: nowIso(),
            text: `Зарезервовано ${i.qty} шт. ${i.sku}`,
            who: 'Система',
          })),
        ],
      }
      s.orders.unshift(order)
      created = order
    })
    return created!
  },

  async confirmOrder(id: string) {
    let order: Order | null = null
    mutate((s) => {
      const idx = s.orders.findIndex((o) => o.id === id)
      if (idx < 0) throw new Error('Замовлення не знайдено')
      const o = s.orders[idx]
      if (o.status !== 'Нове') throw new Error('Можна підтвердити лише нове')
      o.status = 'Підтверджено'
      o.confirmDeadlineMinutes = null
      if (!o.customerName && o.channel === 'Epicentr') {
        o.customerName = 'Клієнт Epicentr'
        o.city = o.city ?? '—'
      }
      o.history.push({ at: nowIso(), text: 'Підтверджено', who: 'Олена' })
      order = o
    })
    return order!
  },

  async cancelOrder(id: string, reason: string) {
    let order: Order | null = null
    mutate((s) => {
      const idx = s.orders.findIndex((o) => o.id === id)
      if (idx < 0) throw new Error('Замовлення не знайдено')
      const o = s.orders[idx]
      if (o.status === 'Скасовано' || o.status === 'Доставлено') {
        throw new Error('Неможливо скасувати')
      }
      if (o.status === 'Нове' || o.status === 'Підтверджено') {
        for (const item of o.items) {
          const p = s.products.find((x) => x.sku === item.sku)
          if (p) {
            p.reserve = Math.max(0, p.reserve - item.qty)
            recalcStock(p)
          }
        }
      }
      o.status = 'Скасовано'
      o.cancelReason = reason
      o.confirmDeadlineMinutes = null
      o.history.push({ at: nowIso(), text: `Скасовано: ${reason}`, who: 'Олена' })
      order = o
    })
    return order!
  },

  async getIntegrations() {
    return store.integrations
  },

  async retryIntegration(id: string) {
    let mp: IntegrationsFile['marketplaces'][0] | null = null
    mutate((s) => {
      const found = s.integrations.marketplaces.find((m) => m.id === id)
      if (!found) throw new Error('Немає площадки')
      found.errorBanner = null
      found.tabLabel = 'працює'
      found.tabTone = 'ok'
      const flow = found.flows.find((f) => f.name === 'Ціни і наявність')
      if (flow) {
        flow.status = 'Працює'
        flow.when = `надіслано о ${new Date().toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      }
      mp = found
    })
    return mp!
  },
}
