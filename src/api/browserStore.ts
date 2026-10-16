/**
 * In-browser mock for GitHub Pages (no Express). Seeded from data/*.json, persists in localStorage.
 */
import seedProducts from '../../data/products.json'
import seedOrders from '../../data/orders.json'
import seedIntegrations from '../../data/integrations.json'
import seedMeta from '../../data/meta.json'
import seedHistory from '../../data/product-history.json'
import seedCategories from '../../data/categories.json'
import seedPrices from '../../data/prices.json'
import type {
  CategoriesFile,
  Category,
  CreateOrderBody,
  IntegrationsFile,
  Order,
  OrderDetail,
  OrderListItem,
  OverviewPayload,
  PricePreview,
  PriceRule,
  PricesFile,
  Product,
  ProductHistoryItem,
} from './client'

const STORAGE_KEY = 'triomio-crm-browser-v4'

type Store = {
  products: Product[]
  orders: Order[]
  integrations: IntegrationsFile
  meta: typeof seedMeta
  history: ProductHistoryItem[]
  categories: CategoriesFile
  prices: PricesFile
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

function deriveSyncStatus(product: Product) {
  if (product.status === 'Чернетка') {
    product.syncStatus = '—'
    return
  }
  // Any channel keys (Rozetka / Prom / Epicentr / site later) — not a fixed count of 3.
  const vals = Object.values(product.channels ?? {})
  const enabled = vals.filter((v) => v !== '—' && v !== 'Вимкнено')
  if (enabled.length === 0) {
    product.syncStatus = '—'
    return
  }
  const active = enabled.filter((v) => v === 'Активний').length
  const problem = enabled.length - active
  if (problem === 0) product.syncStatus = 'Активна'
  else if (active === 0) product.syncStatus = 'Помилка'
  else product.syncStatus = 'Є питання'
}

function applyRounding(n: number, rounding: PriceRule['rounding']) {
  switch (rounding) {
    case 'up_10':
      return Math.ceil(n / 10) * 10
    case 'down_10':
      return Math.floor(n / 10) * 10
    case 'up_100':
      return Math.ceil(n / 100) * 100
    case 'down_100':
      return Math.floor(n / 100) * 100
    case 'to_99':
      return Math.max(0.99, Math.ceil(n) - 0.01)
    default:
      return Math.round(n * 100) / 100
  }
}

function roundingLabelOf(rounding: PriceRule['rounding']) {
  switch (rounding) {
    case 'up_10':
      return 'вгору до 10 грн'
    case 'down_10':
      return 'вниз до 10 грн'
    case 'up_100':
      return 'вгору до 100 грн'
    case 'down_100':
      return 'вниз до 100 грн'
    case 'to_99':
      return 'до *.99'
    default:
      return '—'
  }
}

function pickRule(rules: PriceRule[], marketplace: PriceRule['marketplace'], product: Product) {
  const pool = rules.filter((r) => r.marketplace === marketplace)
  return (
    pool.find((r) => r.scope === 'product' && r.scopeValue === product.sku) ??
    pool.find((r) => r.scope === 'category' && r.scopeValue === product.category) ??
    pool.find((r) => r.scope === 'default') ??
    null
  )
}

function applyPriceRule(base: number, rule: PriceRule | null) {
  if (!rule || rule.kind === 'base') {
    return { price: base, ruleLabel: rule?.ruleLabel ?? 'Як базова ціна' }
  }
  if (rule.kind === 'exact') {
    return { price: rule.value ?? base, ruleLabel: rule.ruleLabel }
  }
  let next = base
  if (rule.kind === 'percent') next = base * (1 + (rule.value ?? 0) / 100)
  if (rule.kind === 'amount') next = base + (rule.value ?? 0)
  next = applyRounding(next, rule.rounding)
  return { price: next, ruleLabel: rule.ruleLabel }
}

function marketplacePrices(product: Product, rules: PriceRule[] = store.prices.rules) {
  const base = product.price
  const old = product.oldPrice
  const rz = applyPriceRule(base, pickRule(rules, 'rozetka', product))
  const ep = applyPriceRule(base, pickRule(rules, 'epicentr', product))
  const pr = applyPriceRule(base, pickRule(rules, 'prom', product))
  const rzOld = old ? applyPriceRule(old, pickRule(rules, 'rozetka', product)).price : null
  const epRule = pickRule(rules, 'epicentr', product)
  const epOld =
    old && epRule?.kind !== 'exact' ? applyPriceRule(old, epRule).price : old
  return {
    rozetka: { price: rz.price, oldPrice: rzOld, rule: rz.ruleLabel },
    epicentr: { price: ep.price, oldPrice: epOld, rule: ep.ruleLabel },
    prom: { price: pr.price, oldPrice: old, rule: pr.ruleLabel },
  }
}

function recountRuleProducts(data: PricesFile, products: Product[]) {
  for (const rule of data.rules) {
    rule.productCount = products.filter(
      (p) => pickRule(data.rules, rule.marketplace, p)?.id === rule.id,
    ).length
  }
  data.meta.ruleCount = data.rules.length
}

function seed(): Store {
  return {
    products: structuredClone(seedProducts) as Product[],
    orders: structuredClone(seedOrders) as Order[],
    integrations: structuredClone(seedIntegrations) as IntegrationsFile,
    meta: structuredClone(seedMeta),
    history: structuredClone(seedHistory) as ProductHistoryItem[],
    categories: structuredClone(seedCategories) as CategoriesFile,
    prices: structuredClone(seedPrices) as PricesFile,
  }
}

function mappingFromLeaf(
  key: 'rozetka' | 'epicentr' | 'prom',
  leaf: { id: string; name: string; attributeSet?: string },
) {
  return {
    leafId: leaf.id,
    name: leaf.name,
    secondary:
      key === 'rozetka'
        ? `ID ${leaf.id}`
        : key === 'epicentr'
          ? `code ${leaf.id} · attribute set ${leaf.attributeSet ?? '—'}`
          : `portal_id ${leaf.id}`,
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
    const lowStockList = products.filter((p) => p.stockLabel === 'Закінчується')
    const low = lowStockList[0]
    const needConfirm = orders.filter((o) => o.status === 'Нове').length
    const awaitingShip = orders.filter((o) => o.status === 'Підтверджено').length
    const today = meta.todayIso.slice(0, 10)
    const ordersTodayList = orders.filter((o) => o.createdAt.startsWith(today))
    const ordersTodaySum = ordersTodayList.reduce((s, o) => s + o.total, 0)
    return {
      meta: {
        ...meta,
        counts: {
          productsTotal: products.length,
          ordersTotal: orders.length,
          lowStock: lowStockList.length,
          drafts: products.filter((p) => p.status === 'Чернетка').length,
          notOnMarketplaces: products.filter((p) => p.syncStatus === '—').length,
          notReady: products.filter((p) => p.syncStatus === 'Є питання').length,
          outOfStock: products.filter((p) => p.stockLabel === 'Немає в наявності').length,
        },
        overview: {
          ...meta.overview,
          needConfirm,
          awaitingShip,
          ordersToday: ordersTodayList.length,
          ordersTodayHint: ordersTodayList.length
            ? `на ${ordersTodaySum.toLocaleString('uk-UA')} грн`
            : 'немає',
          lowStock: lowStockList.length,
          lowStockHint: `з ${products.length} товарів`,
        },
      },
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

  async createProduct() {
    let created: Product | null = null
    mutate((s) => {
      const maxNum = s.products.reduce((max, p) => {
        const m = /^TM-(\d+)/.exec(p.sku)
        return m ? Math.max(max, Number(m[1])) : max
      }, 10000)
      const sku = `TM-${maxNum + 1}`
      const product: Product = {
        sku,
        name: '',
        brand: '',
        category: '',
        status: 'Чернетка',
        price: 0,
        oldPrice: null,
        total: 0,
        reserve: 0,
        available: 0,
        stockLabel: 'Немає в наявності',
        channels: { rozetka: '—', epicentr: '—', prom: '—' },
        syncStatus: '—',
        model: '',
        barcode: '',
        weightKg: null,
        dimensionsCm: '',
        country: '',
        description: '',
        brandMissing: true,
        duplicateOf: null,
        updatedAt: nowIso(),
        updatedBy: 'Олена',
        condition: 'Новий',
      }
      s.products.unshift(product)
      s.history.unshift({
        at: nowIso(),
        sku,
        text: 'Створено чернетку товару',
        who: 'Олена',
        kind: 'Статус',
      })
      created = product
    })
    return { ...created!, marketplacePrices: marketplacePrices(created!) }
  },

  async patchProduct(sku: string, body: Partial<Product>) {
    let next: Product | null = null
    mutate((s) => {
      const idx = s.products.findIndex((p) => p.sku === sku)
      if (idx < 0) throw new Error('Товар не знайдено')
      const prev = s.products[idx]
      const merged = {
        ...prev,
        ...body,
        channels: body.channels ? { ...prev.channels, ...body.channels } : prev.channels,
      }
      if (typeof merged.total === 'number' && merged.total < merged.reserve) {
        throw new Error('Всього не може бути менше резерву')
      }
      merged.brandMissing = !merged.brand
      if (body.channels) deriveSyncStatus(merged)
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
        const qty = Math.max(1, Number(row.qty) || 1)
        const override =
          typeof row.price === 'number' && Number.isFinite(row.price) && row.price >= 0
            ? row.price
            : null
        const price = override ?? p.price
        return {
          sku: p.sku,
          name: p.name,
          qty,
          price,
          oldPrice: override != null && override !== p.price ? p.price : p.oldPrice,
        }
      })
      const delivery = body.delivery ?? 'Нова Пошта'
      if (!['Нова Пошта', 'Міст Експрес'].includes(delivery)) {
        throw new Error('Оберіть Нову Пошту або Міст Експрес')
      }
      const allowedStatus = ['Чернетка', 'Нове', 'Підтверджено'] as const
      const status = allowedStatus.includes(
        (body.status ?? 'Підтверджено') as (typeof allowedStatus)[number],
      )
        ? ((body.status ?? 'Підтверджено') as (typeof allowedStatus)[number])
        : 'Підтверджено'
      const shouldReserve = status === 'Нове' || status === 'Підтверджено'
      if (shouldReserve) {
        for (const row of orderItems) {
          const p = s.products.find((x) => x.sku === row.sku)!
          p.reserve += row.qty
          recalcStock(p)
        }
      }
      const total = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0)
      const payment = body.payment ?? 'Під час отримання'
      const warehouse = body.warehouse ?? 'Основний'
      const addressParts = [
        body.deliveryType || null,
        body.deliveryAddress?.trim() || null,
        body.deliveryPayer ? `платник: ${body.deliveryPayer}` : null,
      ].filter(Boolean)
      const order: Order = {
        id,
        channel: body.channel ?? 'Instagram',
        externalId: null,
        createdAt: nowIso(),
        customerName: body.customerName,
        customerPhone: body.customerPhone ?? null,
        city: body.city ?? null,
        status,
        confirmDeadlineMinutes: status === 'Нове' ? 24 * 60 : null,
        warehouse,
        delivery,
        deliveryAddress: addressParts.length ? addressParts.join(' · ') : null,
        payment,
        ttn: null,
        ttnStatus: null,
        comment: body.comment ?? null,
        cancelReason: null,
        items: orderItems,
        total,
        history: [
          {
            at: nowIso(),
            text: `Створено вручну (${body.channel ?? 'Instagram'}) · ${status} · склад «${warehouse}» · ${delivery} · ${payment}`,
            who: 'Олена',
          },
          ...(shouldReserve
            ? orderItems.map((i) => ({
                at: nowIso(),
                text: `Зарезервовано ${i.qty} шт. ${i.sku}`,
                who: 'Система',
              }))
            : [
                {
                  at: nowIso(),
                  text: 'Чернетка: залишок не резервовано',
                  who: 'Система',
                },
              ]),
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
      if (o.status !== 'Нове' && o.status !== 'Чернетка') {
        throw new Error('Можна підтвердити лише нове або чернетку')
      }
      if (o.status === 'Чернетка') {
        for (const item of o.items) {
          const p = s.products.find((x) => x.sku === item.sku)
          if (!p) throw new Error(`Немає товару ${item.sku}`)
          if (p.available < item.qty) {
            throw new Error(
              `Недостатньо ${item.sku}: доступно ${p.available}, потрібно ${item.qty}`,
            )
          }
          p.reserve += item.qty
          recalcStock(p)
        }
        o.history.push({
          at: nowIso(),
          text: 'Зарезервовано залишок при підтвердженні чернетки',
          who: 'Система',
        })
      }
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

  async createTtn(id: string) {
    let order: Order | null = null
    mutate((s) => {
      const idx = s.orders.findIndex((o) => o.id === id)
      if (idx < 0) throw new Error('Замовлення не знайдено')
      const o = s.orders[idx]
      if (o.status !== 'Підтверджено') {
        throw new Error('Накладну можна створити лише для підтвердженого замовлення')
      }
      if (o.ttn) throw new Error('ТТН вже створено')
      const carrier = o.delivery.includes('Міст') ? 'ME' : 'NP'
      const serial = String(2040000000 + Number(o.id.replace(/\D/g, '') || Date.now() % 1e7))
      o.ttn = `${carrier}${serial}`
      o.ttnStatus = 'Створено (мок)'
      const cod = o.payment === 'Накладений платіж' ? ` · COD ${o.total} грн` : ''
      o.history.push({
        at: nowIso(),
        text: `Створено ТТН ${o.ttn} · ${o.delivery}${cod}`,
        who: 'Олена',
      })
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

  async getCategories() {
    return store.categories
  },

  async createCategory(body: { name: string; parentId?: string | null }) {
    let created: Category | null = null
    mutate((s) => {
      const name = body.name?.trim()
      if (!name) throw new Error('Потрібна назва')
      const parentId = body.parentId ?? null
      if (parentId && !s.categories.categories.some((c) => c.id === parentId)) {
        throw new Error('Немає батьківської категорії')
      }
      const siblings = s.categories.categories.filter((c) => c.parentId === parentId)
      const empty = { leafId: null, name: null, secondary: null }
      created = {
        id: `cat-${Date.now()}`,
        name,
        parentId,
        productCount: 0,
        sortOrder: siblings.length,
        mappings: { rozetka: { ...empty }, epicentr: { ...empty }, prom: { ...empty } },
      }
      s.categories.categories.push(created)
      s.categories.meta.topLevelCount = s.categories.categories.filter((c) => c.parentId == null).length
    })
    return created!
  },

  async patchCategory(
    id: string,
    body: Partial<Pick<Category, 'name' | 'parentId'>> & {
      mappings?: Partial<Category['mappings']>
    },
  ) {
    let next: Category | null = null
    mutate((s) => {
      const idx = s.categories.categories.findIndex((c) => c.id === id)
      if (idx < 0) throw new Error('Категорію не знайдено')
      const current = s.categories.categories[idx]
      if (typeof body.name === 'string' && body.name.trim()) current.name = body.name.trim()
      if (body.parentId !== undefined) {
        if (body.parentId && !s.categories.categories.some((c) => c.id === body.parentId)) {
          throw new Error('Немає батьківської категорії')
        }
        if (body.parentId === current.id) throw new Error('Категорія не може бути батьком собі')
        current.parentId = body.parentId
      }
      if (body.mappings) {
        for (const key of ['rozetka', 'epicentr', 'prom'] as const) {
          const map = body.mappings[key]
          if (!map) continue
          if (map.leafId == null) {
            current.mappings[key] = { leafId: null, name: null, secondary: null }
            continue
          }
          const leaf = s.categories.marketplaceLeaves[key].find((l) => l.id === map.leafId)
          if (!leaf) throw new Error(`Немає категорії ${key}`)
          current.mappings[key] = mappingFromLeaf(key, leaf)
        }
      }
      s.categories.categories[idx] = current
      s.categories.meta.topLevelCount = s.categories.categories.filter((c) => c.parentId == null).length
      next = current
    })
    return next!
  },

  async refreshCategoryDictionaries() {
    mutate((s) => {
      s.categories.meta.dictionariesUpdatedAt = new Date().toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    })
    return store.categories
  },

  async getPrices() {
    recountRuleProducts(store.prices, store.products)
    saveStore(store)
    return store.prices
  },

  async previewPriceRule(
    draft: Partial<PriceRule> &
      Pick<PriceRule, 'marketplace' | 'scope' | 'kind'> & { excludeId?: string },
  ): Promise<PricePreview> {
    const temp: PriceRule = {
      id: 'preview',
      marketplace: draft.marketplace,
      marketplaceLabel:
        draft.marketplace === 'rozetka' ? 'Rozetka' : draft.marketplace === 'epicentr' ? 'Epicentr' : 'Prom',
      scope: draft.scope,
      scopeLabel: draft.scopeLabel ?? '—',
      scopeLevel:
        draft.scope === 'default' ? 'Маркетплейс' : draft.scope === 'category' ? 'Категорія' : 'Товар',
      scopeValue: draft.scopeValue ?? null,
      kind: draft.kind,
      value: draft.value ?? null,
      ruleLabel: draft.ruleLabel ?? '',
      rounding: draft.rounding ?? 'none',
      roundingLabel: draft.roundingLabel ?? '—',
      productCount: 0,
    }
    const existing = store.prices.rules.filter((r) => {
      if (draft.excludeId && r.id === draft.excludeId) return false
      return !(
        r.marketplace === temp.marketplace &&
        r.scope === temp.scope &&
        r.scopeValue === temp.scopeValue
      )
    })
    const withDraft = [...existing, temp]
    const affected = store.products.filter(
      (p) => pickRule(withDraft, temp.marketplace, p)?.id === 'preview',
    )
    const examples = affected.slice(0, 8).map((p) => {
      const before = applyPriceRule(p.price, pickRule(existing, temp.marketplace, p))
      const after = applyPriceRule(p.price, temp)
      return { sku: p.sku, name: p.name, base: p.price, before: before.price, after: after.price }
    })
    const jumps =
      temp.marketplace === 'rozetka'
        ? affected.filter((p) => {
            const before = applyPriceRule(p.price, pickRule(existing, temp.marketplace, p)).price
            const after = applyPriceRule(p.price, temp).price
            return after > before * 1.5 || after < before / 2
          }).length
        : 0
    return { count: affected.length, jumps, examples }
  },

  async createPriceRule(
    body: Partial<PriceRule> & Pick<PriceRule, 'marketplace' | 'scope' | 'kind'>,
  ) {
    let created: PriceRule | null = null
    mutate((s) => {
      const ruleLabel =
        body.kind === 'base'
          ? 'Як базова ціна'
          : body.kind === 'exact'
            ? `Точна ціна ${body.value} грн`
            : body.kind === 'percent'
              ? `+${body.value}%`
              : `+${body.value} грн`
      created = {
        id: `price-${Date.now()}`,
        marketplace: body.marketplace,
        marketplaceLabel:
          body.marketplace === 'rozetka'
            ? 'Rozetka'
            : body.marketplace === 'epicentr'
              ? 'Epicentr'
              : 'Prom',
        scope: body.scope,
        scopeLabel:
          body.scope === 'default'
            ? 'За замовчуванням'
            : String(body.scopeLabel || body.scopeValue || '—'),
        scopeLevel:
          body.scope === 'default' ? 'Маркетплейс' : body.scope === 'category' ? 'Категорія' : 'Товар',
        scopeValue: body.scope === 'default' ? null : (body.scopeValue ?? null),
        kind: body.kind,
        value: body.value ?? null,
        ruleLabel,
        rounding: body.rounding ?? 'none',
        roundingLabel: roundingLabelOf(body.rounding ?? 'none'),
        productCount: 0,
      }
      s.prices.rules = s.prices.rules.filter(
        (r) =>
          !(
            r.marketplace === created!.marketplace &&
            r.scope === created!.scope &&
            r.scopeValue === created!.scopeValue
          ),
      )
      s.prices.rules.push(created)
      recountRuleProducts(s.prices, s.products)
    })
    return created!
  },

  async updatePriceRule(
    id: string,
    body: Partial<PriceRule> & Pick<PriceRule, 'marketplace' | 'scope' | 'kind'>,
  ) {
    let updated: PriceRule | null = null
    mutate((s) => {
      const idx = s.prices.rules.findIndex((r) => r.id === id)
      if (idx < 0) throw new Error('Правило не знайдено')
      const ruleLabel =
        body.kind === 'base'
          ? 'Як базова ціна'
          : body.kind === 'exact'
            ? `Точна ціна ${body.value} грн`
            : body.kind === 'percent'
              ? `+${body.value}%`
              : `+${body.value} грн`
      updated = {
        ...s.prices.rules[idx],
        marketplace: body.marketplace,
        marketplaceLabel:
          body.marketplace === 'rozetka'
            ? 'Rozetka'
            : body.marketplace === 'epicentr'
              ? 'Epicentr'
              : 'Prom',
        scope: body.scope,
        scopeLabel:
          body.scope === 'default'
            ? 'За замовчуванням'
            : String(body.scopeLabel || body.scopeValue || '—'),
        scopeLevel:
          body.scope === 'default' ? 'Маркетплейс' : body.scope === 'category' ? 'Категорія' : 'Товар',
        scopeValue: body.scope === 'default' ? null : (body.scopeValue ?? null),
        kind: body.kind,
        value: body.value ?? null,
        ruleLabel,
        rounding: body.rounding ?? 'none',
        roundingLabel: roundingLabelOf(body.rounding ?? 'none'),
      }
      s.prices.rules = s.prices.rules.filter(
        (r) =>
          r.id === id ||
          !(
            r.marketplace === updated!.marketplace &&
            r.scope === updated!.scope &&
            r.scopeValue === updated!.scopeValue
          ),
      )
      const nextIdx = s.prices.rules.findIndex((r) => r.id === id)
      if (nextIdx >= 0) s.prices.rules[nextIdx] = updated
      else s.prices.rules.push(updated)
      recountRuleProducts(s.prices, s.products)
    })
    return updated!
  },

  async deletePriceRule(id: string) {
    mutate((s) => {
      const before = s.prices.rules.length
      s.prices.rules = s.prices.rules.filter((r) => r.id !== id)
      if (s.prices.rules.length === before) throw new Error('Правило не знайдено')
      recountRuleProducts(s.prices, s.products)
    })
    return { ok: true }
  },

  async retryIntegration(id: string) {
    let mp: IntegrationsFile['marketplaces'][0] | null = null
    mutate((s) => {
      const found = s.integrations.marketplaces.find((m) => m.id === id)
      if (!found) throw new Error('Немає маркетплейси')
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
