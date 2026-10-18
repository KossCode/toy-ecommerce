# Prom.ua Public API — конспект эндпоинтов

Исследование Seller/Public API для CRM «Trio Mio». Только документация и OpenAPI — **живые вызовы с токенами не делались**.

Дата: 18 октября 2026.

Метки достоверности:

- **[Док]** — подтверждено официальным источником (Swagger/OpenAPI или support.prom.ua).
- **[Не найдено]** — в проверенных официальных источниках нет (или противоречие без резолюции).
- **[Неофици]** — сторонний источник; для проектирования не считать нормой.

Связанные документы: общий обзор интеграции [`prom.md`](./prom.md), правила живых аккаунтов [`LIVE-ACCOUNTS-SAFETY.md`](./LIVE-ACCOUNTS-SAFETY.md).

---

## 1. Корни документации и навигация

| Что | URL | Назначение |
| --- | --- | --- |
| Swagger UI (корень) | https://public-api.docs.prom.ua/ | Интерактивная документация, группы методов, «Authorize» |
| OpenAPI index | https://public-api.docs.prom.ua/documentation/index.yaml | Спецификация 3.0.4: servers, paths, security |
| Path-файлы | `…/documentation/{Orders\|Products\|…}/paths/*.yaml` | Контракты отдельных методов |
| Schema-файлы | `…/documentation/{…}/schemas/*.yaml` | Тела запросов/ответов, enum |
| Справка продавца | https://support.prom.ua/ | Токены, импорт YML, остатки, статусы заказов |
| FAQ «есть ли API?» | https://support.prom.ua/hc/uk/articles/360005438678 | Кратко: что умеет API, контакт `api@prom.ua` |
| Примеры кода | https://github.com/evo-company/company-api-example | Python / Node / PHP / Java (ссылка из OpenAPI) |

Как ходить по докам:

1. Открыть [Swagger UI](https://public-api.docs.prom.ua/) → группы **Orders, Products, Clients, Messages, Groups, Payment, Delivery, OrderStatus, Chat**.
2. Для точных полей и enum — качать `index.yaml` и `$ref`-файлы (не полагаться только на UI).
3. Для токенов, YML, остатков, расписания импорта — статьи support.prom.ua (кабинет), не OpenAPI.
4. Вопросы вне спецификации — `api@prom.ua`. [Док]

Версия API в OpenAPI: **1.0.0**, формулировка «закрытый бета-тест для ограниченного числа компаний». [Док]

Языки UI доки: uk / en / ru. [Док]

---

## 2. Base URL, авторизация, токены, scopes, срок

### Base URL

```text
https://my.prom.ua/api/v1
```

В OpenAPI сервер задан шаблоном `https://my.{domain}/api/v1` (для Prom.ua domain = `prom.ua`). [Док]

Пример: `GET https://my.prom.ua/api/v1/products/list?limit=5`. [Док]

### Авторизация

Каждый запрос:

```http
Authorization: Bearer <token>
```

Токен — идентификатор компании. [Док]

### Создание токена (актуальный способ)

| | |
| --- | --- |
| Где | Кабинет → **Налаштування → Управління API-токенами** |
| Кто | Владелец компании или роль **Адміністратор** |
| Параметры | Название (опц.), «Дійсний до» **от 1 дня до 1 года**, права по группам методов |
| Действия | Просмотр/копирование, редактирование (название, срок ≤ 1 год от даты правки, права), безвозвратное удаление |

[Док — support: Управління API-токенами]

Устаревшая формулировка в OpenAPI («токен выдаёт сотрудник портала») **не совпадает** со справкой: сейчас токен создаётся в кабинете. Если не получается — писать на `api@prom.ua`. [Док — FAQ + support; OpenAPI устарел по этому пункту]

### Scopes (группы прав в кабинете)

В справке перечислены **7** блоков, которые настраиваются в UI токена:

| API-группа (OpenAPI) | Блок прав в кабинете | Уровни |
| --- | --- | --- |
| Orders | Замовлення і повідомлення | нет / только чтение / чтение+запись |
| Messages | Замовлення і повідомлення | то же |
| Delivery | Замовлення і повідомлення | то же |
| Products | Продукти та групи | то же |
| Groups | Продукти та групи | то же |
| Clients | Клієнти | то же |
| Payment (`PaymentOption`) | Налаштування | то же |
| **Chat** | **[Не найдено]** в таблице прав токена | В OpenAPI методы есть; как включаются права — уточнять у Prom |

Хотя бы один блок должен быть открыт, иначе ошибка при создании. [Док]

Коды:

| Ситуация | Код |
| --- | --- |
| Нет доступа к группе | **403** Forbidden |
| «Только чтение» + POST/PUT | **403** |
| Просроченный / удалённый токен | **401** Not Authenticated |

[Док]

### Срок действия и отзыв

- Срок: 1 день … 1 год. [Док]
- Уведомления за **30** и **7** дней до окончания (кабинет + push). [Док]
- Удаление токена — сразу 401. [Док]
- OpenAPI ещё описывает отзыв через смену пароля владельца + запрос нового ключа у сотрудника (все старые ключи недействительны) — это рядом с устаревшим «выдаёт сотрудник»; для self-service достаточно удалить/пересоздать токен в кабинете. [Док — оба источника]

Даты/время в API: **UTC**. [Док]

---

## 3. Общие заголовки, ошибки, rate limits

### Заголовки

| Заголовок | Обязателен | Значения / смысл | Источник |
| --- | --- | --- | --- |
| `Authorization` | да | `Bearer <token>` | [Док] |
| `X-LANGUAGE` | нет | `uk` (default), `ru`, `en`, `ro`, `kk` — локаль **ответа** | [Док — `common/schemas/Language.yaml`] |
| `Content-Type` | для тел с JSON | `application/json` (edit, set_status, import_url, …) | [Док — requestBody content] |
| `Content-Type` | для `import_file` | `multipart/form-data` (`file` + `data`) | [Док] |

Отдельной схемы «обязательный Content-Type всегда» в index нет — следует из content media types методов. [Док]

### Форма ошибки

Общий default-ответ (`common/responses/Error.yaml`):

```json
{ "error": "<string>" }
```

[Док]

Для `POST /products/edit` и `edit_by_external_id` успешный **и** ошибочный ответы описаны одной схемой:

```json
{
  "processed_ids": [123, 456],
  "errors": { "<product_id>": "..." }
}
```

[Док — `PostProductResponse`]

Для `POST /orders/set_status` / refund:

```json
{
  "processed_ids": […],
  "warning_message": "<string|null>"
}
```

[Док]

Импорт URL/file при валидации входа:

```json
{ "id": "<string>", "status": "success" | "error" }
```

[Док]

### Rate limits

| Утверждение | Статус |
| --- | --- |
| Официальный rate limit в OpenAPI / Swagger | **[Не найдено]** |
| Официальный rate limit в support.prom.ua (статьи про API-токены) | **[Не найдено]** |
| Цифры от поддержки Prom на форуме OneBox: 200/сек, 400/10 сек, 144000/2 ч; при превышении блок IP | **[Неофици]** |
| Более ранние неофиц. оценки (≈20 req/min и т.п.) в [`prom.md`](./prom.md) | **[Неофици]** — с официальными цифрами форума не согласованы |

**Вывод для CRM:** в спецификации лимита нет. Не долбить API; при блокировке — `api@prom.ua`. Уточнить актуальные лимиты письмом. Не полагаться на неофициальные цифры как на контракт.

Вебхуков / callback в OpenAPI **нет**. [Док — отсутствует в paths]

---

## 4. Каталог групп API

База: `https://my.prom.ua/api/v1`. Все пути ниже — относительно неё. Источник: `index.yaml` + path YAML. [Док]

### Orders

| Метод | Путь | Назначение | Ключевые query/body | Ключевые поля ответа |
| --- | --- | --- | --- | --- |
| GET | `/orders/list` | Список заказов | `status`, `date_from`/`date_to`, `last_modified_from`/`to`, `limit`, `last_id`, `sort_dir` (`asc`/`desc`, default `desc`) | `{ orders: Order[] }` |
| GET | `/orders/{id}` | Заказ | path `id` | `{ order: Order }` |
| POST | `/orders/set_status` | Смена статуса (пачка) | `ids[]`, `status`, `cancellation_reason`, `cancellation_text`, `custom_status_id` | `processed_ids`, `warning_message` |
| POST | `/orders/refund` | Возврат денег покупателю | `ids[]` | `processed_ids`, `warning_message` |
| POST | `/orders/{id}/attach_receipt` | Привязка фискального чека | path `id`, body `receipt_url` | (см. path) |

### Products

| Метод | Путь | Назначение | Ключевые query/body | Ключевые поля ответа |
| --- | --- | --- | --- | --- |
| GET | `/products/list` | Список товаров | `last_modified_from`/`to`, `limit`, `last_id`, `group_id` | `{ group_id, products: Product[] }` |
| GET | `/products/{id}` | Товар по ID Prom | path `id` (int) | `{ product }` |
| GET | `/products/by_external_id/{id}` | Товар по external_id | path `id` (string, URL-encode) | `{ product }` |
| POST | `/products/edit` | Пакетное редактирование по ID Prom | JSON **массив** объектов с `id` | `processed_ids`, `errors` |
| POST | `/products/edit_by_external_id` | То же по external_id | JSON **массив**, `id` = string | `processed_ids`, `errors` |
| POST | `/products/import_url` | Импорт по URL | JSON: `url`, флаги, `updated_fields` | `{ id, status }` |
| POST | `/products/import_file` | Импорт файлом | multipart: `file`, `data` (JSON-настройки) | `{ id, status }` |
| GET | `/products/import/status/{id}` | Статус/отчёт импорта | path `id` | ImportStatus |
| GET | `/products/translation/{id}` | Перевод товара | path `id`, query `lang` **required** | Translation |
| PUT | `/products/translation` | Запись перевода | `product_id`, `lang`, `name`/`keywords`/`description` | `{ status: success }` |

### Groups

| Метод | Путь | Назначение | Ключ. поля |
| --- | --- | --- | --- |
| GET | `/groups/list` | Группы компании | query: `last_modified_from`/`to`, `limit`, `last_id` → группы с `id`, `name`, `parent_group_id`, … |
| GET | `/groups/translation/{id}` | Перевод группы | + query `lang` |
| PUT | `/groups/translation` | Запись перевода группы | body: lang, group id, name/description |

Создания/удаления групп через API **нет**. [Док — только list + translation]

### OrderStatus

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/order_status_options/list` | Стандартные и кастомные статусы: `id`, `name`, `title`, `type` (`default`/`custom`) |

### Delivery

| Метод | Путь | Назначение | Ключ. поля |
| --- | --- | --- | --- |
| GET | `/delivery_options/list` | Способы доставки компании | `id`, `name`, `comment`, `enabled`, `type` |
| POST | `/delivery/save_declaration_id` | Привязка ТТН к заказу | `order_id`, `declaration_id`, `delivery_type`: `nova_poshta` \| `ukrposhta` \| `meest` |

### Payment

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/payment_options/list` | Способы оплаты: `id`, `name`, `description` |

### Clients

| Метод | Путь | Назначение | Ключ. поля |
| --- | --- | --- | --- |
| GET | `/clients/list` | Список клиентов | `limit`, `last_id`, `search_term` |
| GET | `/clients/{id}` | Клиент | `client_full_name`, `phones[]`, `emails[]`, `orders_count`, `total_payout`, … |

### Messages (классические сообщения кабинета)

| Метод | Путь | Назначение | Ключ. поля |
| --- | --- | --- | --- |
| GET | `/messages/list` | Список | `status`, `date_from`/`to`, `limit`, `last_id` |
| GET | `/messages/{id}` | Сообщение | Message |
| POST | `/messages/set_status` | Статус | `ids[]`, `status`: `unread` \| `read` \| `deleted` |
| POST | `/messages/reply` | Ответ | `id`, `message` (≤ 1000 символов) |

### Chat

| Метод | Путь | Назначение | Заметки |
| --- | --- | --- | --- |
| GET | `/chat/rooms` | Комнаты чата | **max/default limit = 20**; `offset`, `sort`, `status`, даты, `project` |
| GET | `/chat/messages_history` | История | фильтры + `room_ident`, `user_id` |
| POST | `/chat/send_message` | Текст | body schema в Chat/schemas |
| POST | `/chat/send_file` | Файл | |
| POST | `/chat/send_attachments` | Вложения | |
| POST | `/chat/mark_message_read` | Прочитано | |
| POST | `/chat/send_order_context` | Контекст заказа в чат | |

---

## 5. Products — контракты

### 5.1 `GET /products/list`

Query: `last_modified_from`, `last_modified_to` (пример `2015-04-28T12:50:34`), `limit`, `last_id` (id не выше указанного), `group_id`. [Док]

Ответ: `{ group_id?, products: Product[] }`. [Док]

### 5.2 `GET /products/{id}` / `GET /products/by_external_id/{id}`

Ответ: `{ product: Product }`. Для external_id рекомендуется URL-encoding. [Док]

### 5.3 Схема `Product` (чтение) — ключевые поля

| Поле | Тип / enum | Комментарий |
| --- | --- | --- |
| `id` | int64 | ID Prom |
| `external_id` | string | ID внешней системы |
| `name`, `name_multilang` | string / multilang | |
| `sku` | string | Артикул |
| `keywords`, `description`, `description_multilang` | | |
| `selling_type` | `retail` \| `wholesale` \| `universal` \| `service` | |
| `presence` | `available` \| `not_available` \| `order` \| `service` | |
| `in_stock` | boolean | «На складі» / готово к отправке (смысл в кабинете) |
| `regions` | Region[] | |
| `price`, `oldprice` (через discount), `currency` | | |
| `discount` | `{ value, type: amount\|percent, date_start, date_end }` | даты в примерах `DD.MM.YYYY` |
| `group`, `category` | объекты | |
| `prices` | оптовая сетка | |
| `main_image`, `images[]` | | |
| `status` | `on_display` \| `draft` \| `deleted` \| `not_on_display` \| `editing_required` \| `approval_pending` \| `deleted_by_moderator` | |
| `quantity_in_stock` | int64 | |
| `measure_unit` | string | |
| `is_variation`, `variation_base_id`, `variation_group_id` | | |

[Док — `Products/schemas/Product.yaml`]

### 5.4 `POST /products/edit`

Тело: **массив** объектов, обязателен `id` (int64 Prom). [Док]

Поля элемента (все опциональны кроме `id`):

| Поле | Ограничения |
| --- | --- |
| `presence` | `available` \| `not_available` \| `order` |
| `in_stock` | boolean |
| `regions` | массив Region |
| `price` | number, min `0.000010` |
| `oldprice` | требует `price`; скидка на **30 дней** с сегодня; нельзя вместе с `discount`; равные `oldprice`==`price` снимают скидку |
| `discount` | object или `null` (удалить); `value`, `type` (`amount`\|`percent`), `date_start`/`date_end` `DD.MM.YYYY` |
| `quantity_in_stock` | int; **отключён** для разновидностей, наследующих наличие |
| `status` | `on_display` \| `draft` \| `deleted` \| `not_on_display` |
| `name` | ≤ 110 |
| `keywords` | ≤ 1024, разделитель `, ` |
| `description` | ≤ 50000, HTML допустим |
| `prices` | `[{ price, minimum_order_quantity }]` |

Ответ: `processed_ids[]`, `errors{}`. [Док]

Максимальный размер пакета в спецификации: **[Не найдено]**.

### 5.5 `POST /products/edit_by_external_id`

То же, но `id` — **string** (external_id). **Нет** полей `in_stock` и `regions` в request schema (есть только в `/edit`). [Док]

### 5.6 `POST /products/import_url`

Content-Type: `application/json`. [Док]

| Поле | Тип | Default / enum |
| --- | --- | --- |
| `url` | string ≤ 1024, **required** | ссылка на xls/csv/xlsx/xml |
| `force_update` | bool | |
| `only_available` | bool | default `false` — только «В наявності» и «Під замовлення» |
| `only_update` | bool | default `false` |
| `mark_missing_product_as` | string | `none` (default) \| `not_available` \| `not_on_display` \| `deleted` |
| `updated_fields` | string[] | default `["price","presence"]`; enum: `name`, `sku`, `price`, `images_urls`, `presence`, `quantity_in_stock`, `description`, `group`, `keywords`, `attributes`, `discount`, `labels`, `gtin`, `mpn`, `name_ua`, `keywords_ua`, `description_ua` |

Ответ: `{ id, status: success|error }`. [Док]

### 5.7 `POST /products/import_file`

`multipart/form-data`: `file` (binary xls/csv/xlsx/xml) + `data` (те же настройки, что у URL, без `url`). [Док]

### 5.8 `GET /products/import/status/{id}`

| Поле | Значение |
| --- | --- |
| `status` | `SUCCESS` \| `PARTIAL` \| `FATAL` |
| Счётчики | `not_changed`, `updated`, `not_in_fle` (опечатка в спеке), `imported`, `created`, `actualized`, `created_active`, `created_hidden`, `total`, `with_errors_count` |
| `errors[]` | объекты с ключами этапов: `download`, `store_file`, `validation`, `import`, `download_images` |

[Док — `ImportStatus.yaml`]

Отчёт относится к импортам, запущенным через API (по `id` из ответа). Отчёт **периодического** импорта из кабинета через API: **[Не найдено]** в OpenAPI.

### 5.9 Translation

- `GET /products/translation/{id}?lang=…` → `{ name, keywords, description }`. [Док]
- `PUT /products/translation` body required: `product_id`, `lang`; опц. `name`, `keywords`, `description` → `{ status: success }`. [Док]

### 5.10 Чего Products API не умеет

| Действие | В OpenAPI |
| --- | --- |
| Создать товар одним POST create | **[Не найдено]** — только edit существующих + import |
| Менять фото / категорию / бренд / attributes точечно | **[Не найдено]** в edit body; фото/группа — через `updated_fields` импорта или кабинет |
| Webhooks о смене товара | **[Не найдено]** |

---

## 6. Orders — контракты, статусы, причины отмены

### 6.1 `GET /orders/list` / `GET /orders/{id}`

Фильтры списка: см. таблицу §4. Для синхронизации CRM предпочтителен `last_modified_from` (ловим смену статусов, не только создание). [Док]

Ключевые поля `Order`:

| Поле | Примечание |
| --- | --- |
| `id`, `date_created` | ISO-8601 UTC, пример с offset |
| `client_first_name`, `client_second_name`, `phone`, email-поля | |
| `products[]` | `id`, `external_id`, `sku`, `quantity`, `price`, `name`, `cpa_commission`, … |
| `delivery_option`, `delivery_provider_data`, `delivery_address` | |
| `payment_option`, `payment_data` | |
| `status` | см. ниже |
| `source` | `portal` \| `company_site` \| `company_cabinet` \| `mobile_app` \| `bigl` |
| `cancellation` | `{ title, initiator: company\|user\|system }` \| null |
| `cpa_commission`, UTM, promo | |

[Док]

### 6.2 Статусы

**В ответе заказа** (описание поля `status`):  
`pending`, `received`, `delivered`, **`cancelled`**, `draft`, `paid`, `custom-{id}`. [Док — EN-описание Order]

**В `POST /orders/set_status` enum `status`:**  
`received`, `delivered`, **`canceled`**, `paid`, `waiting_loan_approval`, `loan_rejected`, `loan_approved`. [Док]

| Кабинет (ориентир) | API | Примечание |
| --- | --- | --- |
| Нове | `pending` | В set_status **нет** `pending` — только чтение/другие переходы |
| Прийнято | `received` | |
| Виконано | `delivered` | |
| Скасовано | ответ: `cancelled` / запрос: `canceled` | **Расхождение написания в одной спецификации** — проверить на тесте |
| Оплачено | `paid` | |
| Чернетка | `draft` | |
| Свой | `custom-{id}` + `custom_status_id` в set_status | |

Справочник: `GET /order_status_options/list` → `name`/`title`/`type`. [Док]

Полная матрица допустимых переходов статусов: **[Не найдено]** в OpenAPI (только enum целевых значений).

### 6.3 `POST /orders/set_status`

Body:

```json
{
  "ids": [123],
  "status": "received|delivered|canceled|paid|waiting_loan_approval|loan_rejected|loan_approved",
  "cancellation_reason": "…",
  "cancellation_text": "…",
  "custom_status_id": 1
}
```

`cancellation_reason` enum:  
`not_available`, `buyers_request`, `duplicate`, `invalid_phone_number`, `another`, `payment_not_received`, `no_product_variants`. [Док]

`cancellation_text` обязателен, если reason = `another` (в описании также упомянут `price_changed`, но в **enum reason его нет** — внутреннее противоречие спеки). [Док]

### 6.4 `POST /orders/refund`

Body: `{ "ids": [ … ] }`. [Док]

### 6.5 `POST /orders/{id}/attach_receipt`

Body: `{ "receipt_url": "…" }`. [Док]

---

## 7. Groups, delivery, payment, clients, messages/chat — сводные таблицы

### Groups

| Метод | Путь | Request | Response (ключевое) |
| --- | --- | --- | --- |
| GET | `/groups/list` | `last_modified_*`, `limit`, `last_id` | группы: `id`, `name`, `description`, `image`, `parent_group_id`, multilang |
| GET | `/groups/translation/{id}` | `lang` | Translation |
| PUT | `/groups/translation` | lang + id + поля перевода | success |

Create/delete групп: **[Не найдено]** в API.

### Delivery

| Метод | Путь | Request | Response |
| --- | --- | --- | --- |
| GET | `/delivery_options/list` | — | `id`, `name`, `comment`, `enabled`, `type` |
| POST | `/delivery/save_declaration_id` | `order_id`, `declaration_id`, `delivery_type` ∈ `nova_poshta`\|`ukrposhta`\|`meest` | см. path |

### Payment

| Метод | Путь | Response |
| --- | --- | --- |
| GET | `/payment_options/list` | `id`, `name`, `description` |

### Clients

| Метод | Путь | Request | Response |
| --- | --- | --- | --- |
| GET | `/clients/list` | `limit`, `last_id`, `search_term` | Client[] |
| GET | `/clients/{id}` | path id | `client_full_name`, `phones`, `emails`, `comment`, `skype`, `orders_count`, `total_payout` |

### Messages

| Метод | Путь | Ключевое |
| --- | --- | --- |
| GET | `/messages/list` | фильтры дат/статуса |
| GET | `/messages/{id}` | Message; статусы сообщения: `unread`\|`read`\|`deleted` |
| POST | `/messages/set_status` | `ids`, `status` |
| POST | `/messages/reply` | `id`, `message` ≤ 1000 |

### Chat

| Метод | Путь | Ключевое |
| --- | --- | --- |
| GET | `/chat/rooms` | **≤ 20** комнат за запрос |
| GET | `/chat/messages_history` | история по комнате/фильтрам |
| POST | `/chat/send_message` | текст |
| POST | `/chat/send_file` | файл |
| POST | `/chat/send_attachments` | вложения |
| POST | `/chat/mark_message_read` | прочитано |
| POST | `/chat/send_order_context` | контекст заказа |

Права Chat в UI токена: **[Не найдено]** (см. §2).

---

## 8. YML-фид vs API — что API не закрывает

Детали формата YML — в [`prom.md`](./prom.md) и support-статьях об импорте. Здесь — граница ответственности.

| Задача | YML / кабинетный автоимпорт | Public API |
| --- | --- | --- |
| Создание новых товаров | Да (импорт) | Только через `import_url` / `import_file`, не через edit |
| Фото, категория маркетплейса, бренд, характеристики (`param`) | Да (YML/файл) | edit **не** содержит этих полей; импорт — через `updated_fields` (`images_urls`, `attributes`, `group`, …) |
| Быстрое точечное обновление цены/остатка | Медленно (4 ч / сутки) | `edit` / `edit_by_external_id` |
| Расписание автоимпорта по URL (4 ч, ночной полный) | Только кабинет | API даёт **разовый** `import_url` |
| `mark_missing_product_as=deleted` / not_available | Кабинет + API import | Опасно на LIVE |
| Настройки «Автоматично перераховувати кількість залишків» | Только кабинет | **[Не найдено]** в API |
| Webhooks новых заказов | — | **[Не найдено]** → polling `/orders/list` |
| «Під замовлення» (`presence: order`) | В YML явное значение **[Не найдено]** в формате (см. prom.md) | Есть в API edit |

Практическая схема (из [`prom.md`](./prom.md), не дублируем как догму API): YML для контента/страховки + API для остатков/цен + опрос заказов.

---

## 9. Sandbox / тестовая компания

### Вердикт: **ЕСТЬ** (как отдельная тестовая компания, не отдельный host)

Источник: раздел **«Тестування (пісочниця)»** в OpenAPI / Swagger. [Док]

Как получить:

1. Зарегистрировать **новую** компанию на портале (в OpenAPI есть ссылка-шаблон регистрации).
2. Сообщить менеджеру Prom **ID этой компании**.
3. Получить уникальный ключ доступа к кабинету тестовой компании через API.
4. Тестировать в течение **тестового периода** (в UI uk: **7 днів**; в шаблоне OpenAPI — `{{TRIAL}}` дней, автоактивация).

[Док]

Отдельного sandbox-host вроде `sandbox.prom.ua` в спецификации **нет** — base URL тот же `https://my.prom.ua/api/v1`, другой company token. [Док]

Self-service токен для тестовой компании создаётся так же в её кабинете (после появления компании); формулировка «менеджер пришлёт ключ» может относиться к онбордингу trial — при сомнении писать `api@prom.ua`. [Док / уточнять]

### Что безопасно

- Вся отладка контрактов, enum, `external_id`, импорта — **на тестовой компании**.
- На LIVE компании Trio Mio: только read-only, пока нет явного «да» (см. §10 и `LIVE-ACCOUNTS-SAFETY.md`).

---

## 10. Safety notes для LIVE-аккаунтов

См. также [`LIVE-ACCOUNTS-SAFETY.md`](./LIVE-ACCOUNTS-SAFETY.md). Кратко для Prom API:

1. **По умолчанию только чтение:** `GET /products/*`, `GET /orders/*`, `GET /order_status_options/list`, справочники delivery/payment.
2. **Никогда** не вызывать без явного подтверждения в чате:
   - `POST /products/edit`, `POST /products/edit_by_external_id` (особенно `quantity_in_stock`, `presence`, `status: deleted`);
   - `POST /products/import_url` / `import_file` с `mark_missing_product_as` ≠ `none`;
   - `POST /orders/set_status`, `refund`, `attach_receipt`;
   - `POST /delivery/save_declaration_id`;
   - любые chat/messages write.
3. Батч остатков/цен — только после dry-run списка SKU и подтверждения. Случайный `quantity_in_stock: 0` остановит продажи.
4. Токены — секреты: не в git, не в GitHub Pages, не в логах публичного репо.
5. Учитывать авто-перерасчёт остатков в кабинете Prom (см. support «Залишки товарів» / [`prom.md`](./prom.md)) — иначе двойное списание при пуше абсолютных остатков.
6. При сомнении в `canceled`/`cancelled` или причине отмены — стоп, не угадывать на проде.

---

## 11. Таблица источников

| № | Источник | Что подтверждает | Метка |
| --- | --- | --- | --- |
| 1 | https://public-api.docs.prom.ua/ | Корень Swagger, группы, sandbox, base URL, Bearer | [Док] |
| 2 | https://public-api.docs.prom.ua/documentation/index.yaml | OpenAPI 3.0.4: paths, servers, security | [Док] |
| 3 | Path/schema YAML под `…/documentation/{Group}/…` | Полные контракты методов и enum | [Док] |
| 4 | https://support.prom.ua/hc/uk/articles/360020350478 | Self-service токены, scopes, 401/403, срок 1 год | [Док] |
| 5 | https://support.prom.ua/hc/uk/articles/360005438678 | Есть ли API, swagger, `api@prom.ua`, генерация токена в кабинете | [Док] |
| 6 | https://support.prom.ua/hc/uk/articles/360004963478 | Импорт из файла/ссылки (кабинет), расписание | [Док] |
| 7 | https://support.prom.ua/hc/uk/articles/360004963538 | Формат YML | [Док] |
| 8 | https://support.prom.ua/hc/uk/articles/360005252177 | Залишки / авто-перерасчёт | [Док] |
| 9 | https://github.com/evo-company/company-api-example | Примеры клиентов | [Док] |
| 10 | Форум OneBox (цитаты поддержки Prom про 200/сек и т.д.) | Rate limit | [Неофици] |
| 11 | Официальный rate limit в OpenAPI/support API | — | **[Не найдено]** |
| 12 | Webhooks в OpenAPI | — | **[Не найдено]** |
| 13 | Max batch size `edit` / `edit_by_external_id` | — | **[Не найдено]** |
| 14 | Отдельный sandbox hostname | — | **[Не найдено]** (есть trial-компания) |
| 15 | Scope Chat в UI токена | — | **[Не найдено]** |
| 16 | [`prom.md`](./prom.md) | Контекст интеграции Trio Mio; перепроверять по 1–9 | подсказки |

Контакт: **api@prom.ua**.

---

*Документ не коммитился автоматически. Живые вызовы Prom API с credentials не выполнялись.*
