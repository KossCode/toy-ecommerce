import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CrmLayout } from '@/layouts/CrmLayout'
import { OverviewPage } from '@/pages/OverviewPage'
import { OrdersPage } from '@/pages/OrdersPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ProductPage } from '@/pages/ProductPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'
import { StockPage } from '@/pages/StockPage'
import { StubPage } from '@/pages/StubPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<CrmLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:sku" element={<ProductPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="categories" element={<StubPage title="Категорії" />} />
          <Route path="brands" element={<StubPage title="Бренди" />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="prices" element={<StubPage title="Ціни" />} />
          <Route path="customers" element={<StubPage title="Клієнти" />} />
          <Route path="promotions" element={<StubPage title="Акції" />} />
          <Route path="analytics" element={<StubPage title="Аналітика" />} />
          <Route path="content" element={<StubPage title="Контент" />} />
          <Route path="settings" element={<StubPage title="Налаштування" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
