# FE ↔ BE parity checklist

Pass every checkbox against a **real Java API** (`npm run dev:java` + `./mvnw spring-boot:run -Dspring-boot.run.profiles=local`).  
GitHub Pages (`VITE_USE_BROWSER_API=true`) is a **browser mock** — Network tab will show **no** `/api` calls; that is expected. A yellow banner in the CRM shell means mock mode.

How to mark: `[ ]` not checked · `[x]` OK against Java · `[~]` partial / known gap · `[!]` broken.

---

## 0. Environment

- [ ] Backend up: `http://localhost:8080/actuator/health` → 200
- [ ] Admin via Vite proxy: `npm run dev:java` → `http://localhost:5173` (no mock banner)
- [ ] Login as `owner@demo.local` / password from `backend/.env.local`
- [ ] DevTools Network: mutating actions show `PATCH`/`POST`/`PUT` to `/api/...`
- [ ] Pages build (`kosscode.github.io/...`): mock banner visible; no `/api` traffic

---

## 1. Auth / session

| UI | API | Check |
| --- | --- | --- |
| Login | `POST /api/auth/login` (+ CSRF) | [ ] |
| Me / shell name | `GET /api/auth/me` | [ ] |
| Logout | `POST /api/auth/logout` | [ ] |
| Change password | `POST /api/auth/password` | [ ] |
| CSRF before writes | `GET /api/auth/csrf` | [ ] |

---

## 2. Огляд (`/`)

| UI | API | Check |
| --- | --- | --- |
| Dashboard cards / lists | `GET /api/overview` | [ ] |
| Links to orders / products / integrations | — | [ ] |

---

## 3. Замовлення (`/orders`, `/orders/:id`)

| UI | API | Check |
| --- | --- | --- |
| List | `GET /api/orders` | [ ] |
| Detail | `GET /api/orders/{id}` | [ ] |
| Create manual order | `POST /api/orders` | [ ] |
| Confirm | `POST /api/orders/{id}/confirm` | [ ] |
| TTN | `POST /api/orders/{id}/ttn` | [ ] |
| Cancel | `POST /api/orders/{id}/cancel` | [ ] |

---

## 4. Товари (`/products`, `/products/:sku`)

| UI | API | Check |
| --- | --- | --- |
| List / tabs | `GET /api/products` | [ ] |
| Create draft | `POST /api/products` | [ ] |
| Open card | `GET /api/products/{sku}` | [ ] |
| Save fields / price | `PATCH /api/products/{sku}` | [ ] |
| Change stock total | `PATCH` → inventory + `STOCK` outbox | [ ] |
| Channel chips on card | `PATCH` body `channels` | [ ] |
| History | `GET /api/products/{sku}/history` | [ ] |
| Images upload / reorder / delete | image endpoints | [ ] (stage gap if UI missing) |

---

## 5. Категорії (`/categories`)

| UI | API | Check |
| --- | --- | --- |
| Tree / list | `GET /api/categories` | [ ] |
| Create | `POST /api/categories` | [ ] |
| Rename / parent / MP mappings | `PATCH /api/categories/{id}` | [ ] |
| Refresh dictionaries | `POST /api/categories/refresh-dictionaries` | [ ] |

---

## 6. Ціни (`/prices`)

| UI | API | Check |
| --- | --- | --- |
| Rules list | `GET /api/prices` | [ ] |
| Preview | `POST /api/prices/preview` | [ ] |
| Create / update / delete | `POST` / `PATCH` / `DELETE /api/prices...` | [ ] |
| After rule change → PRICE outbox (DB) | listeners | [ ] |

---

## 7. Інтеграції (`/integrations/:mp`)

| UI | API | Check |
| --- | --- | --- |
| Tabs persist in URL (`prom` default) | route | [ ] |
| Status / readiness / errors | `GET /api/integrations` | [ ] |
| Retry failed outbox | `POST /api/integrations/{id}/retry` | [ ] |
| Write mode dropdown | `PATCH /api/integrations/{id}/mode` | [ ] **Network must show PATCH** |
| Feed URL copy | from `connection.feedUrl` | [ ] |
| Sync products table load | `GET /api/integrations/{id}/products` | [ ] |
| Add products | `PATCH .../products` `{enabled:true}` | [ ] **Network** |
| Stop sync | `PATCH .../products` `{enabled:false}` | [ ] **Network** |
| Sort / page size UI | client-only | [ ] |
| Schedule edit / add / disable | `PUT /api/integrations/{id}/schedules/{flow}` | [ ] |
| Run now | `POST /api/jobs/{name}/trigger` | [ ] |
| Feed file after rebuild | `GET /feeds/{token}/{mp}.xml` | [ ] |

### Known follow-ups (not blockers for this pass)

- [ ] Multiple calendar triggers per feed flow (00:05 + 12:00)
- [ ] Back arrow on detail pages (`location.state.from`)
- [ ] Credentials / outbox / dry-run UI (API stubs in docs only)

---

## 8. Stub pages (no BE yet)

| Route | Check |
| --- | --- |
| `/customers` | [ ] stub only |
| `/promotions` | [ ] stub only |
| `/analytics` | [ ] stub only |
| `/content` | [ ] stub only |
| `/settings` | [ ] stub only (users API exists but UI incomplete) |

---

## 9. Cross-cutting

| Concern | Check |
| --- | --- |
| OWNER vs MANAGER: mode/schedules OWNER-only | [ ] |
| MANAGER can patch sync products | [ ] |
| Problem+JSON errors surface in UI | [ ] |
| After stock/price change: `sync_outbox` + optional dirty feed | [ ] |

---

## Smoke script (local, after login cookie)

```bash
# CSRF + login (adjust password)
curl -c /tmp/crm.txt -b /tmp/crm.txt -s http://localhost:8080/api/auth/csrf >/dev/null
XSRF=$(grep XSRF-TOKEN /tmp/crm.txt | awk '{print $7}')
curl -c /tmp/crm.txt -b /tmp/crm.txt -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $XSRF" \
  -d '{"email":"owner@demo.local","password":"YOUR_PASSWORD"}'

XSRF=$(grep XSRF-TOKEN /tmp/crm.txt | awk '{print $7}')
curl -b /tmp/crm.txt -s -X PATCH http://localhost:8080/api/integrations/prom/mode \
  -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $XSRF" \
  -d '{"mode":"DRY_RUN"}'
curl -b /tmp/crm.txt -s http://localhost:8080/api/integrations/prom/products | head -c 200; echo
```

---

## Result log

| Date | Tester | Env | Notes |
| --- | --- | --- | --- |
| | | local / Pages / Docker | |
