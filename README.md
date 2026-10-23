# Trio Mio CRM

Адмінка CRM (React/Vite) + Java Spring Boot API.

## Локально

```bash
# 1) БД + бекенд (див. docs/backend/03-local-development.md)
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=local

# 2) UI з проксі на Java
npm install
npm run dev:java
```

- UI: http://localhost:5173  
- API: http://localhost:8080  
- Демо-користувачі (якщо в `backend/.env.local` є `app.demo.user-password`): `owner@demo.local` / `manager@demo.local`

Без `VITE_API_PROXY` Vite за замовчуванням також проксує `/api` на `:8080` (див. `vite.config.ts`); старий Express-мок видалено.

## Демо для заказчика (GitHub Pages)

Статичний білд з in-browser моком (localStorage):

**https://kosscode.github.io/toy-ecommerce/**

```bash
npm run build:pages
```

Роутинг через hash (`#/orders`, `#/products`).

## Документація бекенду

План і acceptance criteria: [`docs/backend/README.md`](docs/backend/README.md).
