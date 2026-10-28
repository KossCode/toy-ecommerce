# FE ↔ BE parity checklist

Pass every checkbox against a **real Java API** (`npm run dev:java` + `./mvnw spring-boot:run -Dspring-boot.run.profiles=local`).  
GitHub Pages (`VITE_USE_BROWSER_API=true`) is a **browser mock** — Network tab will show **no** `/api` calls; that is expected. A yellow banner in the CRM shell means mock mode.

How to mark: `[ ]` not checked · `[x]` OK against Java · `[~]` partial / known gap · `[!]` broken.

---

## 0. Environment

- [x] Backend up: `http://localhost:8080/actuator/health` → 200
- [x] Admin via Vite proxy: `npm run dev:java` → `http://localhost:5173` (no mock banner; unauth `/api/auth/me` → 401)
- [x] Login as `owner@demo.local` / password from `backend/.env.local`
- [x] Mutating actions hit `/api/...` (mode / sync products / product patch verified)
- [~] Pages build: mock-only by design (not re-verified this pass)

---

## 1. Auth / session

| UI | API | Check |
| --- | --- | --- |
| Login | `POST /api/auth/login` (+ CSRF) | [x] |
| Me / shell name | `GET /api/auth/me` | [x] |
| Logout | `POST /api/auth/logout` | [~] not re-hit this pass |
| Change password | `POST /api/auth/password` | [ ] skipped (destructive) |
| CSRF before writes | `GET /api/auth/csrf` | [x] |

---

## 2. Огляд (`/`)

| UI | API | Check |
| --- | --- | --- |
| Dashboard cards / lists | `GET /api/overview` | [x] |
| Links to orders / products / integrations | — | [x] (code: `state.from`) |

---

## 3. Замовлення (`/orders`, `/orders/:id`)

| UI | API | Check |
| --- | --- | --- |
| List | `GET /api/orders` | [x] |
| Detail | `GET /api/orders/{id}` | [x] |
| Create manual order | `POST /api/orders` | [x] 201 |
| Confirm | `POST /api/orders/{id}/confirm` | [x] on `Нове`; 400 if already confirmed |
| TTN | `POST /api/orders/{id}/ttn` | [x] |
| Cancel | `POST /api/orders/{id}/cancel` | [x] |

---

## 4. Товари (`/products`, `/products/:sku`)

| UI | API | Check |
| --- | --- | --- |
| List / tabs | `GET /api/products` | [x] |
| Create draft | `POST /api/products` | [~] not re-hit this pass |
| Open card | `GET /api/products/{sku}` | [x] |
| Save fields / price | `PATCH /api/products/{sku}` | [x] |
| Change stock total | `PATCH` → inventory + `STOCK` outbox | [x] |
| Channel chips on card | `PATCH` body `channels` | [~] API path exists; UI not re-clicked |
| History | `GET /api/products/{sku}/history` | [x] |
| Images upload / reorder / delete | image endpoints | [~] **no ProductPage UI** yet (API in backlog) |
| Back arrow | `PageHeader` + `state.from` | [x] implemented this pass |

---

## 5. Категорії (`/categories`)

| UI | API | Check |
| --- | --- | --- |
| Tree / list | `GET /api/categories` | [x] |
| Create | `POST /api/categories` | [~] not re-hit |
| Rename / parent / MP mappings | `PATCH /api/categories/{id}` | [~] not re-hit |
| Refresh dictionaries | `POST /api/categories/refresh-dictionaries` | [x] 202 |

---

## 6. Ціни (`/prices`)

| UI | API | Check |
| --- | --- | --- |
| Rules list | `GET /api/prices` | [x] |
| Preview | `POST /api/prices/preview` | [x] |
| Create / update / delete | `POST` / `PATCH` / `DELETE` | [~] not re-hit writes |
| After rule change → PRICE outbox | listeners | [~] covered by unit tests earlier |

---

## 7. Інтеграції (`/integrations/:mp`)

| UI | API | Check |
| --- | --- | --- |
| Tabs persist in URL (`prom` default) | route | [x] code |
| Status / readiness / errors | `GET /api/integrations` | [x] |
| Retry failed outbox | `POST /api/integrations/{id}/retry` | [~] not re-hit |
| Write mode dropdown | `PATCH /api/integrations/{id}/mode` | [x] |
| Feed URL copy | from `connection.feedUrl` | [x] feed GET 200 |
| Sync products table load | `GET /api/integrations/{id}/products` | [x] |
| Add products | `PATCH .../products` `{enabled:true}` | [x] |
| Stop sync | `PATCH .../products` `{enabled:false}` | [x] |
| Sort / page size UI | client-only | [x] code |
| Schedule edit | `PUT /api/integrations/{id}/schedules/{flow}` | [x] |
| Run now | `POST /api/jobs/{name}/trigger` | [x] 202 |
| Feed file after rebuild | `GET /feeds/{token}/{mp}.xml` | [x] |

### Known follow-ups

- [ ] Multiple calendar triggers per feed flow (00:05 + 12:00)
- [x] Back arrow on detail pages (`location.state.from`)
- [ ] Credentials / outbox / dry-run UI (API stubs only)
- [ ] Product images UI
- [ ] Users / settings UI (API exists)

---

## 8. Stub pages (no BE yet)

| Route | Check |
| --- | --- |
| `/customers` | [x] stub |
| `/promotions` | [x] stub |
| `/analytics` | [x] stub |
| `/content` | [x] stub |
| `/settings` | [x] stub (users API without full UI) |

---

## 9. Cross-cutting

| Concern | Check |
| --- | --- |
| OWNER vs MANAGER: mode/schedules OWNER-only | [~] not role-switched this pass |
| MANAGER can patch sync products | [~] |
| Problem+JSON errors surface in UI | [x] confirm 400 body has `code` |
| After stock/price change: outbox / dirty | [x] stock+price PATCH 200 |

---

## Result log

| Date | Tester | Env | Notes |
| --- | --- | --- | --- |
| 2026-10-28 | agent | local Java + `dev:java` | 26/26 core GETs/PATCHes OK; order create/ttn/cancel OK; confirm OK on `Нове`; job trigger 202; back-nav shipped on PR branch |
