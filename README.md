# Trio Mio CRM

Адмінка CRM на React (Vite) з моком даних.

## Локально (Express + JSON на диск)

```bash
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001 (`data/*.json`)

## Демо для заказчика (GitHub Pages)

Статический билд с in-browser моком (localStorage). После деплоя:

**https://kosscode.github.io/toy-ecommerce/**

```bash
npm run build:pages   # или push в crm-file-mock-mvp / master — Actions задеплоит
```

Роутинг через hash (`#/orders`, `#/products`), чтобы Pages работал без серверного fallback.

## Экраны

Огляд, Замовлення (+ ручное Instagram), картка замовлення, Товари, товар (вкладки), Наявність, Інтеграції. Остальное — «Розділ у роботі».

Дизайн — в `docs/`.
