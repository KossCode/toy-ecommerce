# REST API

Назад к плану: [`README.md`](README.md).

## 1. Общие правила

| Тема | Правило |
| --- | --- |
| Префикс | `/api` |
| Формат | JSON, поля в `camelCase`, кодировка UTF-8 |
| Даты | ISO 8601 со смещением (`2026-10-07T10:02:00+03:00`) |
| Деньги | число с двумя знаками после точки (`349.00`) |
| Идентификаторы в URL | товар — `sku`, заказ — `number`, остальное — числовой `id` |
| Изменение | `PATCH` с частичным телом; `POST` для действий (`/orders/{number}/confirm`) |
| Конкурентные правки | тело `PATCH` содержит `version`; не совпало → `409` |
| Списки | на этапе паритета — массив, как сейчас в моке; затем `?page=&size=&sort=` → `{ items, total, page, size }` |

## 2. Ошибки

Все ошибки — `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)):

```json
{
  "type": "https://admin.<domain>/problems/validation",
  "title": "Некоректні дані",
  "status": 400,
  "detail": "Ціна має бути більшою за нуль",
  "code": "VALIDATION_FAILED",
  "errors": [{ "field": "basePrice", "message": "має бути > 0" }]
}
```

| Статус | Когда |
| --- | --- |
| 400 | валидация |
| 401 | нет сессии |
| 403 | нет прав или нет CSRF-токена |
| 404 | не найдено |
| 409 | конфликт версии; недопустимый переход статуса |
| 422 | бизнес-правило (например, «товар не готов к площадке») |
| 429 | слишком много попыток входа |
| 500 | непредвиденная ошибка; в теле только `traceId`, без стека |

Тексты `title` и `detail` — на украинском, потому что их видит пользователь админки.

## 3. OpenAPI и типы для админки

- springdoc генерирует спецификацию по контроллерам: `/api/docs` (UI) и `/api/docs/openapi.json`. В профиле `prod` UI выключен.
- Типы для фронта: `npx openapi-typescript http://localhost:8080/api/docs/openapi.json -o src/api/schema.d.ts`. Файл коммитим; CI проверяет, что он не расходится со спецификацией.
- Ручные типы в `src/api/client.ts` заменяются сгенерированными по мере переноса эндпоинтов.

## 4. Аутентификация в запросах

- Cookie `SESSION` (HttpOnly, Secure, SameSite=Lax) ставится после `POST /api/auth/login`.
- CSRF: Spring Security кладёт токен в cookie `XSRF-TOKEN`; клиент читает её и отправляет в заголовке `X-XSRF-TOKEN` на каждом `POST`/`PATCH`/`PUT`/`DELETE`. Сам вход — тоже `POST`, поэтому перед ним клиент вызывает `GET /api/auth/csrf`. После входа токен меняется: новый приходит в ответе на вход, в той же cookie.
- Ошибки безопасности приходят как problem+json с полем `code`: `UNAUTHORIZED`, `SESSION_EXPIRED` (401); `FORBIDDEN`, `CSRF_INVALID`, `PASSWORD_CHANGE_REQUIRED` (403); `BAD_CREDENTIALS` (401 на входе); `TOO_MANY_ATTEMPTS` (429).
- CORS выключен: админка и API на одном origin.

Подробно — [`06-auth-and-roles.md`](06-auth-and-roles.md).

## 5. Что поменять в клиенте админки

Сейчас в [`../../src/api/client.ts`](../../src/api/client.ts):

1. Браузерный мок только при `VITE_USE_BROWSER_API === 'true'` (Pages). Сборка для AWS ходит в реальный API.
2. Текст ошибки — `detail`, затем `title`.
3. `credentials: 'same-origin'` и заголовок `X-XSRF-TOKEN` (перед входом — `GET /api/auth/csrf`).
4. На `401` — переход на `#/login`.

## 6. Паритет с Express-моком

Каждая строка закрывается, когда эндпоинт реализован в Java, покрыт тестом и админка работает с ним без изменений поведения.

| Готово | Метод и путь (мок) | Модуль | Заметки |
| --- | --- | --- | --- |
| [x] | `GET /api/meta` | `dashboard` | пользователь берётся из сессии, а не из файла |
| [x] | `GET /api/overview` | `dashboard` | |
| [x] | `GET /api/products` | `catalog` | |
| [x] | `POST /api/products` | `catalog` | создаёт черновик |
| [x] | `GET /api/products/{sku}` | `catalog` | |
| [x] | `PATCH /api/products/{sku}` | `catalog` | остаток через InventoryService → outbox; `version`/409 — позже |
| [x] | `GET /api/products/{sku}/history` | `catalog` | из `audit_log` |
| [x] | `GET /api/orders` | `orders` | |
| [x] | `GET /api/orders/{id}` | `orders` | path = `orders.number` |
| [x] | `POST /api/orders` | `orders` | ручной заказ; резерв |
| [x] | `POST /api/orders/{id}/confirm` | `orders` | outbox ORDER_STATUS — на этапе 9 |
| [x] | `POST /api/orders/{id}/ttn` | `orders` | пока только сохранение номера; API Новой Почты — позже |
| [x] | `POST /api/orders/{id}/cancel` | `orders` | снятие резерва; причина обязательна |
| [x] | `GET /api/categories` | `catalog` | |
| [x] | `POST /api/categories` | `catalog` | |
| [x] | `PATCH /api/categories/{id}` | `catalog` | маппинги на категории площадок |
| [x] | `POST /api/categories/refresh-dictionaries` | `catalog` | пишет timestamp в settings, ответ `202` |
| [x] | `GET /api/prices` | `pricing` | |
| [x] | `POST /api/prices/preview` | `pricing` | |
| [x] | `POST /api/prices` | `pricing` | |
| [x] | `PATCH /api/prices/{id}` | `pricing` | |
| [x] | `DELETE /api/prices/{id}` | `pricing` | |
| [x] | `GET /api/integrations` | `integrations` | `connection`: mode/maxMode/feedUrl/schedules + flows из `job_runs` / outbox |
| [x] | `POST /api/integrations/{id}/retry` | `integrations` | повтор `FAILED` строк outbox |
| [x] | `PATCH /api/integrations/{id}/mode` | `integrations` | OWNER; потолок `INTEGRATIONS_MAX_MODE` |
| [x] | `PUT /api/integrations/{id}/schedules/{flow}` | `integrations` | OWNER; flow=`orders`\|`feed`; INTERVAL/CALENDAR → Quartz |
| [x] | `GET /api/integrations/{id}/products` | `integrations` | список на синхронізації + candidates (ACTIVE без enabled) |
| [x] | `PATCH /api/integrations/{id}/products` | `integrations` | OWNER/MANAGER; `{items:[{sku,enabled}]}` → `product_channels` + outbox/dirty |
| [x] | `GET /feeds/{token}/{marketplace}.xml` | `feeds` | публичный YML; неверный токен → 404 |

## 7. Новые эндпоинты (нет в моке)

| Метод и путь | Роль | Назначение |
| --- | --- | --- |
| `GET /api/auth/csrf` | открыт | выдать cookie `XSRF-TOKEN` перед входом |
| `POST /api/auth/login` | открыт | вход |
| `POST /api/auth/logout` | все | выход, `204` |
| `GET /api/auth/me` | все | текущий пользователь и роль |
| `POST /api/auth/password` | все | смена своего пароля; остальные сессии пользователя завершаются |
| `GET/POST /api/users`, `PATCH /api/users/{id}` | OWNER | список, создание (временный пароль в ответе один раз), имя/роль/активность |
| `POST /api/users/{id}/reset-password` | OWNER | новый временный пароль, сессии пользователя завершаются |
| `POST /api/products/{sku}/images` | OWNER, MANAGER | загрузка фото (`multipart/form-data`) |
| `PATCH /api/products/{sku}/images/order` | OWNER, MANAGER | порядок фото |
| `DELETE /api/products/{sku}/images/{id}` | OWNER, MANAGER | удаление фото |
| `PUT /api/integrations/{marketplace}/credentials` | OWNER | сохранить ключ; в ответе только маска (этап 9.4) |
| `GET /api/integrations/{marketplace}/outbox` | OWNER, MANAGER | очередь и ошибки отправок |
| `GET /api/integrations/{marketplace}/dry-run-report` | OWNER | что было бы отправлено в `DRY_RUN` |
| `POST /api/jobs/{name}/trigger` | OWNER | запустить джобу вне расписания (уже в UI «Розклад CRM») |
| `GET /healthz` | открыт | `200` / `503` без подробностей |
