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
- CSRF: Spring Security кладёт токен в cookie `XSRF-TOKEN`; клиент читает её и отправляет в заголовке `X-XSRF-TOKEN` на каждом `POST`/`PATCH`/`PUT`/`DELETE`.
- CORS выключен: админка и API на одном origin.

Подробно — [`06-auth-and-roles.md`](06-auth-and-roles.md).

## 5. Что поменять в клиенте админки

Сейчас в [`../../src/api/client.ts`](../../src/api/client.ts):

1. Браузерный мок включается при `VITE_USE_BROWSER_API === 'true'` **или** `import.meta.env.PROD`. Второе условие убрать: прод-сборка для AWS должна ходить в API, а демо для Pages и так собирается с `VITE_USE_BROWSER_API=true`.
2. Текст ошибки читается из `body.error`; нужно читать `detail`, затем `title`.
3. Добавить `credentials: 'same-origin'` и заголовок `X-XSRF-TOKEN`.
4. На `401` — переход на экран входа.

## 6. Паритет с Express-моком

Каждая строка закрывается, когда эндпоинт реализован в Java, покрыт тестом и админка работает с ним без изменений поведения.

| Готово | Метод и путь (мок) | Модуль | Заметки |
| --- | --- | --- | --- |
| [ ] | `GET /api/meta` | `dashboard` | пользователь берётся из сессии, а не из файла |
| [ ] | `GET /api/overview` | `dashboard` | |
| [ ] | `GET /api/products` | `catalog` | |
| [ ] | `POST /api/products` | `catalog` | создаёт черновик |
| [ ] | `GET /api/products/{sku}` | `catalog` | |
| [ ] | `PATCH /api/products/{sku}` | `catalog` | + `version`; изменения цены и остатка → outbox |
| [ ] | `GET /api/products/{sku}/history` | `audit` | |
| [ ] | `GET /api/orders` | `orders` | |
| [ ] | `GET /api/orders/{id}` | `orders` | в Java — по `number` |
| [ ] | `POST /api/orders` | `orders` | ручной заказ; резерв |
| [ ] | `POST /api/orders/{id}/confirm` | `orders` | для заказа с площадки → outbox `ORDER_STATUS` |
| [ ] | `POST /api/orders/{id}/ttn` | `orders` | пока только сохранение номера; API Новой Почты — позже |
| [ ] | `POST /api/orders/{id}/cancel` | `orders` | снятие резерва; причина обязательна |
| [ ] | `GET /api/categories` | `catalog` | |
| [ ] | `POST /api/categories` | `catalog` | |
| [ ] | `PATCH /api/categories/{id}` | `catalog` | маппинги на категории площадок |
| [ ] | `POST /api/categories/refresh-dictionaries` | `catalog` | ставит джобу `DictionariesRefreshJob`, ответ `202` |
| [ ] | `GET /api/prices` | `pricing` | |
| [ ] | `POST /api/prices/preview` | `pricing` | |
| [ ] | `POST /api/prices` | `pricing` | |
| [ ] | `PATCH /api/prices/{id}` | `pricing` | |
| [ ] | `DELETE /api/prices/{id}` | `pricing` | |
| [ ] | `GET /api/integrations` | `integrations` | данные из `integration_settings`, `job_runs`, `sync_outbox` |
| [ ] | `POST /api/integrations/{id}/retry` | `integrations` | повтор `FAILED` строк outbox |

## 7. Новые эндпоинты (нет в моке)

| Метод и путь | Роль | Назначение |
| --- | --- | --- |
| `POST /api/auth/login` | все | вход |
| `POST /api/auth/logout` | все | выход |
| `GET /api/auth/me` | все | текущий пользователь и роль |
| `POST /api/auth/password` | все | смена своего пароля |
| `GET/POST/PATCH /api/users` | OWNER | управление пользователями, сброс пароля |
| `POST /api/products/{sku}/images` | OWNER, MANAGER | загрузка фото (`multipart/form-data`) |
| `PATCH /api/products/{sku}/images/order` | OWNER, MANAGER | порядок фото |
| `DELETE /api/products/{sku}/images/{id}` | OWNER, MANAGER | удаление фото |
| `PATCH /api/integrations/{marketplace}/mode` | OWNER | смена режима записи ([`08-marketplace-sync.md`](08-marketplace-sync.md) §2) |
| `PUT /api/integrations/{marketplace}/credentials` | OWNER | сохранить ключ; в ответе только маска |
| `GET /api/integrations/{marketplace}/outbox` | OWNER, MANAGER | очередь и ошибки отправок |
| `GET /api/integrations/{marketplace}/dry-run-report` | OWNER | что было бы отправлено в `DRY_RUN` |
| `POST /api/jobs/{name}/trigger` | OWNER | запустить джобу вне расписания |
| `GET /feeds/{token}/{marketplace}.xml` | по токену | фид для площадки |
| `GET /healthz` | открыт | `200` / `503` без подробностей |
