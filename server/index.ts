import cors from 'cors'
import express from 'express'
import { readJson, writeJson } from './store'
import type { CategoriesFile, Category, IntegrationsFile, Meta, Order, Product } from './types'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

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
  if (product.awaiting && product.available === 0) {
    product.stockLabel = 'Очікується'
  } else if (product.available === 0) {
    product.stockLabel = 'Немає в наявності'
  } else if (product.available <= 5) {
    product.stockLabel = 'Закінчується'
  } else {
    product.stockLabel = 'В наявності'
  }
}

function roundUpTo10(n: number) {
  return Math.ceil(n / 10) * 10
}

function marketplacePrices(product: Product) {
  const base = product.price
  const old = product.oldPrice
  let rozetka = product.brand === 'LEGO' ? roundUpTo10(base * 1.08) : roundUpTo10(base * 1.12)
  let epicentr =
    product.sku === 'TM-10188' ? 399 : roundUpTo10(base * 1.08)
  const prom = base
  const rozetkaOld = old
    ? product.brand === 'LEGO'
      ? roundUpTo10(old * 1.08)
      : roundUpTo10(old * 1.12)
    : null
  const epicentrOld = old && product.sku !== 'TM-10188' ? roundUpTo10(old * 1.08) : old
  return {
    rozetka: { price: rozetka, oldPrice: rozetkaOld, rule: product.brand === 'LEGO' ? '+8%, вгору до 10' : '+12%, вгору до 10' },
    epicentr: {
      price: epicentr,
      oldPrice: epicentrOld,
      rule: product.sku === 'TM-10188' ? 'Точна ціна' : '+8%, вгору до 10',
    },
    prom: { price: prom, oldPrice: old, rule: 'Як базова ціна' },
  }
}

app.get('/api/meta', (_req, res) => {
  res.json(readJson<Meta>('meta.json'))
})

app.get('/api/overview', (_req, res) => {
  const meta = readJson<Meta>('meta.json')
  const orders = readJson<Order[]>('orders.json')
  const products = readJson<Product[]>('products.json')
  const integrations = readJson<IntegrationsFile>('integrations.json')

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

  res.json({
    meta,
    todo,
    integrations: integrations.marketplaces.map((m) => ({
      id: m.id,
      name: m.name,
      tabTone: m.tabTone,
      summary:
        m.id === 'epicentr' && m.errorBanner
          ? `Помилка о 09:12`
          : m.id === 'rozetka'
            ? 'Синхронізовано о 10:05 · 1 помилка модерації'
            : 'Синхронізовано о 10:05',
      hasRetry: Boolean(m.errorBanner),
    })),
    lowStockSample: low
      ? { sku: low.sku, name: low.name, available: low.available }
      : null,
  })
})

app.get('/api/products', (_req, res) => {
  res.json(readJson<Product[]>('products.json'))
})

app.get('/api/products/:sku', (req, res) => {
  const products = readJson<Product[]>('products.json')
  const product = products.find((p) => p.sku === req.params.sku)
  if (!product) {
    res.status(404).json({ error: 'Товар не знайдено' })
    return
  }
  res.json({ ...product, marketplacePrices: marketplacePrices(product) })
})

app.patch('/api/products/:sku', (req, res) => {
  const products = readJson<Product[]>('products.json')
  const idx = products.findIndex((p) => p.sku === req.params.sku)
  if (idx < 0) {
    res.status(404).json({ error: 'Товар не знайдено' })
    return
  }
  const allowed = [
    'name',
    'description',
    'brand',
    'category',
    'model',
    'barcode',
    'country',
    'weightKg',
    'dimensionsCm',
    'status',
    'price',
    'oldPrice',
    'total',
    'awaiting',
    'condition',
    'color',
    'ageGroup',
    'material',
    'type',
    'partsCount',
    'series',
    'channels',
  ] as const
  const next = { ...products[idx] }
  for (const key of allowed) {
    if (key in req.body) {
      // @ts-expect-error dynamic assign
      next[key] = req.body[key]
    }
  }
  if (typeof next.total === 'number' && next.total < next.reserve) {
    res.status(400).json({ error: 'Всього не може бути менше резерву' })
    return
  }
  next.brandMissing = !next.brand
  recalcStock(next)
  next.updatedAt = nowIso()
  next.updatedBy = 'Олена'
  products[idx] = next
  writeJson('products.json', products)
  res.json({ ...next, marketplacePrices: marketplacePrices(next) })
})

app.get('/api/products/:sku/history', (req, res) => {
  const history = readJson<{ at: string; sku: string; text: string; who: string; kind: string }[]>(
    'product-history.json',
  )
  res.json(history.filter((h) => h.sku === req.params.sku))
})

app.get('/api/orders', (_req, res) => {
  const orders = readJson<Order[]>('orders.json')
  res.json(
    orders.map((o) => ({
      ...o,
      confirmLabel: formatDeadline(o.confirmDeadlineMinutes),
      itemsLabel:
        o.items.length === 1
          ? `${o.items[0].sku} × ${o.items[0].qty}`
          : `${o.items.length} товари`,
    })),
  )
})

app.get('/api/orders/:id', (req, res) => {
  const orders = readJson<Order[]>('orders.json')
  const order = orders.find((o) => o.id === req.params.id)
  if (!order) {
    res.status(404).json({ error: 'Замовлення не знайдено' })
    return
  }
  const products = readJson<Product[]>('products.json')
  const stock = order.items.map((item) => {
    const p = products.find((x) => x.sku === item.sku)
    return { sku: item.sku, available: p?.available ?? 0 }
  })
  res.json({
    ...order,
    confirmLabel: formatDeadline(order.confirmDeadlineMinutes),
    stock,
  })
})

app.post('/api/orders', (req, res) => {
  const orders = readJson<Order[]>('orders.json')
  const products = readJson<Product[]>('products.json')
  const {
    channel = 'Instagram',
    customerName,
    customerPhone,
    city,
    deliveryAddress,
    payment = 'Під час отримання',
    comment,
    items,
  } = req.body as {
    channel?: string
    customerName: string
    customerPhone?: string
    city?: string
    deliveryAddress?: string
    payment?: string
    comment?: string
    items: { sku: string; qty: number }[]
  }

  if (!customerName || !items?.length) {
    res.status(400).json({ error: 'Потрібні клієнт і склад' })
    return
  }

  const maxNum = orders.reduce((max, o) => {
    const n = Number(o.id.replace('TM-', ''))
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 10482)
  const id = `TM-${maxNum + 1}`

  const orderItems = items.map((row) => {
    const p = products.find((x) => x.sku === row.sku)
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
    const p = products.find((x) => x.sku === row.sku)!
    p.reserve += row.qty
    recalcStock(p)
  }
  writeJson('products.json', products)

  const total = orderItems.reduce((s, i) => s + i.price * i.qty, 0)
  const order: Order = {
    id,
    channel,
    externalId: null,
    createdAt: nowIso(),
    customerName,
    customerPhone: customerPhone ?? null,
    city: city ?? null,
    status: 'Підтверджено',
    confirmDeadlineMinutes: null,
    delivery: 'Нова Пошта',
    deliveryAddress: deliveryAddress ?? null,
    payment,
    ttn: null,
    ttnStatus: null,
    comment: comment ?? null,
    cancelReason: null,
    items: orderItems,
    total,
    history: [
      {
        at: nowIso(),
        text: `Створено вручну (${channel})`,
        who: 'Олена',
      },
      ...orderItems.map((i) => ({
        at: nowIso(),
        text: `Зарезервовано ${i.qty} шт. ${i.sku}`,
        who: 'Система',
      })),
    ],
  }

  orders.unshift(order)
  writeJson('orders.json', orders)
  res.status(201).json(order)
})

app.post('/api/orders/:id/confirm', (req, res) => {
  const orders = readJson<Order[]>('orders.json')
  const idx = orders.findIndex((o) => o.id === req.params.id)
  if (idx < 0) {
    res.status(404).json({ error: 'Замовлення не знайдено' })
    return
  }
  const order = orders[idx]
  if (order.status !== 'Нове') {
    res.status(400).json({ error: 'Можна підтвердити лише нове' })
    return
  }
  order.status = 'Підтверджено'
  order.confirmDeadlineMinutes = null
  if (!order.customerName && order.channel === 'Epicentr') {
    order.customerName = 'Клієнт Epicentr'
    order.city = order.city ?? '—'
  }
  order.history.push({ at: nowIso(), text: 'Підтверджено', who: 'Олена' })
  orders[idx] = order
  writeJson('orders.json', orders)
  res.json(order)
})

app.post('/api/orders/:id/cancel', (req, res) => {
  const orders = readJson<Order[]>('orders.json')
  const products = readJson<Product[]>('products.json')
  const idx = orders.findIndex((o) => o.id === req.params.id)
  if (idx < 0) {
    res.status(404).json({ error: 'Замовлення не знайдено' })
    return
  }
  const order = orders[idx]
  if (order.status === 'Скасовано' || order.status === 'Доставлено') {
    res.status(400).json({ error: 'Неможливо скасувати' })
    return
  }
  const reason = (req.body?.reason as string) || 'скасовано менеджером'
  if (order.status === 'Нове' || order.status === 'Підтверджено') {
    for (const item of order.items) {
      const p = products.find((x) => x.sku === item.sku)
      if (p) {
        p.reserve = Math.max(0, p.reserve - item.qty)
        recalcStock(p)
      }
    }
    writeJson('products.json', products)
  }
  order.status = 'Скасовано'
  order.cancelReason = reason
  order.confirmDeadlineMinutes = null
  order.history.push({
    at: nowIso(),
    text: `Скасовано: ${reason}`,
    who: 'Олена',
  })
  orders[idx] = order
  writeJson('orders.json', orders)
  res.json(order)
})

app.get('/api/categories', (_req, res) => {
  res.json(readJson<CategoriesFile>('categories.json'))
})

app.post('/api/categories', (req, res) => {
  const data = readJson<CategoriesFile>('categories.json')
  const name = String(req.body?.name ?? '').trim()
  const parentId = (req.body?.parentId as string | null) ?? null
  if (!name) {
    res.status(400).json({ error: 'Потрібна назва' })
    return
  }
  if (parentId && !data.categories.some((c) => c.id === parentId)) {
    res.status(400).json({ error: 'Немає батьківської категорії' })
    return
  }
  const siblings = data.categories.filter((c) => c.parentId === parentId)
  const id = `cat-${Date.now()}`
  const emptyMap = { leafId: null, name: null, secondary: null }
  const created: Category = {
    id,
    name,
    parentId,
    productCount: 0,
    sortOrder: siblings.length,
    mappings: { rozetka: { ...emptyMap }, epicentr: { ...emptyMap }, prom: { ...emptyMap } },
  }
  data.categories.push(created)
  data.meta.topLevelCount = data.categories.filter((c) => c.parentId == null).length
  writeJson('categories.json', data)
  res.status(201).json(created)
})

app.patch('/api/categories/:id', (req, res) => {
  const data = readJson<CategoriesFile>('categories.json')
  const idx = data.categories.findIndex((c) => c.id === req.params.id)
  if (idx < 0) {
    res.status(404).json({ error: 'Категорію не знайдено' })
    return
  }
  const current = data.categories[idx]
  const body = req.body as Partial<Category> & {
    mappings?: Partial<Category['mappings']>
  }
  if (typeof body.name === 'string' && body.name.trim()) current.name = body.name.trim()
  if (body.parentId !== undefined) {
    if (body.parentId && !data.categories.some((c) => c.id === body.parentId)) {
      res.status(400).json({ error: 'Немає батьківської категорії' })
      return
    }
    if (body.parentId === current.id) {
      res.status(400).json({ error: 'Категорія не може бути батьком собі' })
      return
    }
    current.parentId = body.parentId
  }
  if (body.mappings) {
    for (const key of ['rozetka', 'epicentr', 'prom'] as const) {
      const next = body.mappings[key]
      if (!next) continue
      if (next.leafId == null) {
        current.mappings[key] = { leafId: null, name: null, secondary: null }
        continue
      }
      const leaf = data.marketplaceLeaves[key].find((l) => l.id === next.leafId)
      if (!leaf) {
        res.status(400).json({ error: `Немає категорії ${key}` })
        return
      }
      current.mappings[key] = {
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
  }
  data.categories[idx] = current
  data.meta.topLevelCount = data.categories.filter((c) => c.parentId == null).length
  writeJson('categories.json', data)
  res.json(current)
})

app.post('/api/categories/refresh-dictionaries', (_req, res) => {
  const data = readJson<CategoriesFile>('categories.json')
  const now = new Date()
  data.meta.dictionariesUpdatedAt = now.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  writeJson('categories.json', data)
  res.json(data)
})

app.get('/api/integrations', (_req, res) => {
  res.json(readJson<IntegrationsFile>('integrations.json'))
})

app.post('/api/integrations/:id/retry', (req, res) => {
  const data = readJson<IntegrationsFile>('integrations.json')
  const mp = data.marketplaces.find((m) => m.id === req.params.id)
  if (!mp) {
    res.status(404).json({ error: 'Немає площадки' })
    return
  }
  mp.errorBanner = null
  mp.tabLabel = 'працює'
  mp.tabTone = 'ok'
  const flow = mp.flows.find((f) => f.name === 'Ціни і наявність')
  if (flow) {
    flow.status = 'Працює'
    flow.when = `надіслано о ${new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
  }
  writeJson('integrations.json', data)
  res.json(mp)
})

app.listen(PORT, () => {
  console.log(`CRM mock API http://localhost:${PORT}`)
})
