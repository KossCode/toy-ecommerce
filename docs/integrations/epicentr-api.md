# Epicentr Merchant API — конспект контрактов

Исследование для Trio Mio CRM. Дата: 18 октября 2026.

Обозначения:

- **[Док]** — подтверждено официальным источником (Swagger OpenAPI и/или база знаний `supportm.epicentrk.ua`). Ссылка рядом.
- **[Не найдено]** — в официальных источниках нет (или явно отрицается).
- **[Вывод]** — следствие из документации; нужна проверка на аккаунте.

Не вызывать live API из этого документа. Write-операции на живом кабинете — только после явного «да» (см. [`LIVE-ACCOUNTS-SAFETY.md`](LIVE-ACCOUNTS-SAFETY.md)). Обзор XML/кабинета: [`epicentr.md`](epicentr.md).

Спецификация: OpenAPI **3.0.0**, `info.version` **1.0.0**, title **Merchant API**, статус в описании — «closed beta-test for a limited amount of companies». [Док]

---

## 1. Корни документации

| Ресурс | URL | Что даёт |
| --- | --- | --- |
| Swagger UI | https://merchant-api.epicentrm.com.ua/swagger/ | Интерактивная спека EN / UA |
| OpenAPI EN | https://merchant-api.epicentrm.com.ua/swagger/swagger.yaml | Полный каталог эндпоинтов и схем |
| OpenAPI UA | https://merchant-api.epicentrm.com.ua/swagger/swagger.ukr.yaml | То же, украинские summary/description |
| База знаний продавца | https://supportm.epicentrk.ua/ | XML-импорт, автооновлення, API, статусы заказов |
| Робота з API | https://supportm.epicentrk.ua/robotazapi/ | Токен, роли, FAQ, нет sandbox, примеры |
| XML з характеристиками | https://supportm.epicentrk.ua/xmlfayl/ | YML-шаблон; PIM-эндпоинты для кодов |
| Автооновлення залишків | https://supportm.epicentrk.ua/avtoonovlennya/ | Короткий фид цены/наличия; интервалы |
| Статуси замовлень | https://supportm.epicentrk.ua/statusyzamovlen/ | SLA 120 мин, цепочка статусов |
| Примеры кода | https://github.com/epicentrm/merchant-api | Python / Node / PHP / Java (см. оговорку ниже) |

Связанный обзор в репо: [`epicentr.md`](epicentr.md) — сверять факты с этим файлом; при расхождении приоритет у Swagger + supportm.

---

## 2. Base URL, авторизация, роли, включение токена

### Base URL [Док]

| Хост | Статус |
| --- | --- |
| `https://merchant-api.epicentrm.com.ua` | Рабочий хост в KB, примерах запросов и GitHub samples |
| `https://mp-api.epicentrm.com.ua` | Упомянут только в HTML-описании swagger (`Request example` для `/v2/pim/products`). В `servers` OpenAPI **нет** секции `servers`. [Док на упоминание; резолв хоста в этом исследовании не проверялся повторно] |

Пути вроде `/v2/pim/products` в примере описания **не существуют** как операции в `paths` текущей спеки (есть только справочники PIM). [Док]

Примеры GitHub (`/v1/my/user`) в текущей `swagger.yaml` **отсутствуют**. [Док]

### Авторизация [Док]

Заголовок на каждый запрос:

```http
Authorization: Bearer mp_<token>
```

В swagger:

- `components.securitySchemes`: `jwt` (`http` + `bearer` + `bearerFormat: JWT`) и `wsse` (`apiKey` в заголовке `X-WSSE`).
- Глобальный `security`: `[{ jwt: [] }, { wsse: [] }]`.
- В описании и KB для продавца используется именно **Bearer-токен** вида `mp_…` из кабинета, не отдельный login/password flow.

Токен — идентификатор компании. Не светить в публичном репо / логах. [Док]

### Как включить токен [Док — supportm `/robotazapi/`]

1. Роль **«Адміністратор компанії»** (не «Менеджер компанії» — иначе писать в підтримку на смену роли).
2. Активировать тогл в **«Додаткові налаштування»** (подключение к API).
3. Вкладка **«Налаштування → Налаштування компанії → API»** (доступ к вкладке открывает категорийный менеджер — так в описании swagger).
4. «Згенерувати» / «Оновити ключ»; можно несколько активных ключей; деактивация — удаление из списка.
5. **Срок действия:** токены бессрочные, пока не удалены.

### Права / роли [Док + оговорки]

| Что | Источник |
| --- | --- |
| Генерация токена — только Адміністратор компанії | KB robotazapi |
| `POST /v1/offers` требует permission «update offers»; без него `403` | swagger description эндпоинта |
| FAQ KB: «API лише для обробки замовлень», «обміну цін та залишків немає» | KB robotazapi — **расходится** со swagger, где `POST /v1/offers` описан. На аккаунте право может быть закрыто → [Вывод] уточнять у менеджера |
| Ограничения ролей на отмену заказов в кабинете | KB `order_cancel2` (см. epicentr.md); **распространение на API-токен — [Не найдено]** |

---

## 3. Заголовки, даты, ошибки, rate limits

### Заголовки [Док]

| Header | Значение | Обязательность |
| --- | --- | --- |
| `Authorization` | `Bearer mp_…` | Да |
| `Content-Type` | `application/json` | Для тел POST/PUT/PATCH |
| `Accept` | `application/json` (в samples) | Рекомендуется |
| `X-WSSE` | альтернативная схема из swagger | Для продавца обычно не нужна |

HTTPS обязателен. Все действия через API логируются. [Док]

### Даты [Док]

Все поля даты/времени в API — **UTC** (явно в описании swagger и UA-описании).

Примеры фильтров заказов в swagger — даты вида `2020-10-09` (без времени). Гранулярность до секунд в фильтре — [Не найдено] → при polling дедуплицировать по `id` + `updatedAt`. [Вывод]

### Ошибки [Док]

Типичные HTTP-коды из спеки:

| Код | Когда (по swagger) |
| --- | --- |
| `200` / `201` / `202` / `204` | Успех (зависит от метода) |
| `400` | Валидация тела / параметров (`InvalidRequestResponse`, `invalidInput`) |
| `401` | `unauthorized` |
| `403` | `forbidden` (нет права, в т.ч. нет permission на offers) |
| `404` | `notFound` |

Схема `ErrorResponse`: `{ message: string, code: integer }`.

Для `POST /v1/offers` детальная таблица кодов валидации в description эндпоинта (request-level → `400`; item-level → `201` + `status: skipped` + `errors`). Примеры сообщений: `"Sorry, something went wrong…"`, коды вроде `validation.not_null`, `validation.count.max`, `security.context.company_id.required`.

Код **`429` в swagger отсутствует**. [Не найдено]

### Rate limits / webhooks [Не найдено]

- Rate limits, throttle, quota — **не описаны** в swagger и KB robotazapi.
- Webhook / callback — **нет упоминаний** в swagger (`webhook`/`callback` = 0). Polling заказов — единственный канал уведомлений. [Вывод]

Поддержка API: `merchant@epicentrk.ua`, тема письма «Робота з API «назва магазину»». [Док]

---

## 4. Каталог эндпоинтов (из swagger.yaml)

Всего **44** операции в `paths`. Теги: OFFERS, PIM, OMS, DELIVERY, Payment-V3, BILLING. Ниже — полный список из загруженной спеки (EN summary).

### OFFERS (2)

| Метод | Путь | Summary |
| --- | --- | --- |
| POST | `/v1/offers` | Batch update offers |
| GET | `/v1/offers/update-results/{requestId}` | Show batch update result |

### PIM (3) — только справочники

| Метод | Путь | Summary |
| --- | --- | --- |
| GET | `/v2/pim/categories` | Get list of categories |
| GET | `/v2/pim/attribute-sets` | Get list of attribute sets |
| GET | `/v2/pim/attribute-sets/{attributeSetCode}/attributes/{attributeCode}/options` | Get list of attribute options |

**Нет** `GET/POST /v2/pim/products` и любых write по карточкам товара. [Док]

### OMS (24)

| Метод | Путь | Summary |
| --- | --- | --- |
| GET | `/v4/oms/orders` | Get order list with cursor pagination |
| GET | `/v4/oms/orders/total` | Get total number of orders |
| GET | `/v3/oms/orders` | Get order list with cursor pagination (prev) |
| GET | `/v3/oms/orders/total` | Get total list of order with cursor (prev) |
| GET | `/v6/oms/orders/{orderId}` | Get order details by ID |
| GET | `/v5/oms/orders/{orderId}` | Get order details V5 |
| GET | `/v2/oms/orders/{orderId}/allowed-statuses` | Get order allowed statuses |
| POST | `/v2/oms/orders/{orderId}/change-status/to/{orderStatus}` | Change Order status |
| GET | `/v2/oms/order-cancel-reasons/customer` | Get available order cancel reasons |
| PUT | `/v3/oms/orders/{orderId}/items/{offerId}` | Edit order items |
| POST | `/v3/oms/orders/{orderId}/items` | Add order item |
| DELETE | `/v2/oms/orders/{orderId}/items/{offerId}` | Delete order items |
| POST | `/v3/oms/orders/{orderId}/client-data` | Update order client data |
| PATCH | `/v1/oms/orders/{orderId}/invoice-client-data` | Edit order invoice client |
| POST | `/v4/oms/orders/{orderId}/delivery-data/{deliveryProvider}` | Edit order delivery data |
| POST | `/v3/oms/orders/{orderId}/delivery-data/{deliveryProvider}` | Edit order delivery data (prev) |
| POST | `/v3/oms/orders/{orderId}/shipping/{deliveryProvider}` | Create order shipment |
| PATCH | `/v1/oms/orders/{orderId}/shipment-number` | Edit order delivery number |
| DELETE | `/v1/oms/orders/{orderId}/shipment-number` | Delete order shipment number |
| GET | `/v2/oms/orders/{orderId}/comments` | Get comments from Order |
| POST | `/v2/oms/orders/{orderId}/comments` | Add comment to Order |
| POST | `/v3/orders/{orderId}/comments` | Add comment to order (alt path) |
| POST | `/v2/oms/orders/{orderId}/call-status` | Update order call status |
| POST | `/v2/oms/orders/{orderId}/payment/generate-url` | Generate payment URL |

### DELIVERY (12)

| Метод | Путь | Summary |
| --- | --- | --- |
| GET | `/v1/deliveries/shipment-providers` | Get authorized company delivery provider list |
| GET | `/v1/deliveries/shipments/companies/{companyId}/providers` | Get company delivery provider list |
| GET | `/v3/deliveries/providers/{deliveryProvider}/settlements` | Get delivery settlements by provider |
| GET | `/v3/deliveries/providers/{deliveryProvider}/settlements/{settlementId}` | Get delivery settlement by ID |
| GET | `/v3/deliveries/providers/{deliveryProvider}/settlements/{settlementId}/offices` | Get delivery settlement offices |
| GET | `/v3/deliveries/providers/{deliveryProvider}/settlements/{settlementId}/offices/{officeId}` | Get delivery settlement office by ID |
| GET | `/v3/deliveries/providers/{deliveryProvider}/participants/{participant}/settlements` | Settlements by provider + participant |
| GET | `/v3/deliveries/providers/{deliveryProvider}/participants/{participant}/settlements/{settlementId}/offices` | Offices by provider + participant |
| GET | `/v3/deliveries/{provider}/invoices/{number}` | Get delivery invoice by provider and number |
| GET | `/v3/deliveries/{provider}/companies/{companyId}/invoice/{number}` | Get delivery invoice by company |
| GET | `/v2/deliveries/pickup-points/enabled` | Pickup points (authorized company) |
| GET | `/v2/deliveries/pickup/companies/{companyId}/pickup-points/enabled` | Pickup points for company |

`DeliveryProvider` enum: `nova_poshta`, `ukrposhta`, `pickup`, `meest`, `cvz_epicentr`, `parcel_box_epicentr`, `courier_delivery`. [Док]

### PAYMENT (tag `Payment-V3`, 2)

| Метод | Путь | Summary |
| --- | --- | --- |
| GET | `/v3/payments/payment-providers` | Get payment settings for authorized company |
| GET | `/v3/payments/companies/{companyId}` | Get payment settings for Company |

### BILLING (1)

| Метод | Путь | Summary |
| --- | --- | --- |
| GET | `/v1/billing/orders/{orderId}/invoice` | Get invoice by order ID |

---

## 5. Детальные контракты

### 5.1. `POST /v1/offers` — пакет цены и наличия [Док]

**Назначение:** асинхронный batch update `availability` и/или `prices` (не контент карточки).

**Permission:** update offers; иначе `403`.

**Лимиты:** `items` — от 1 до **1000**. Идентичные запросы компании **идемпотентны 30 минут** (тот же `requestId`).

**Тело (`BatchOfferUpdateInputModel`):**

```json
{
  "items": [
    {
      "productId": 123456,
      "sku": "sku-1",
      "availability": "in_stock",
      "prices": {
        "price": 1299.99,
        "oldPrice": 1499.99
      }
    }
  ]
}
```

| Поле | Правила |
| --- | --- |
| `productId` / `sku` | Нужен хотя бы один; оба usable |
| `availability` | enum: `in_stock` \| `under_the_order` \| `not_available` |
| `prices.price` | number > 0, multipleOf 0.01 |
| `prices.oldPrice` | nullable; если задан — должен быть **строго больше** `price` |
| `prices` | пустой объект `{}` → request-level `400` (`validation.update_value.required`) |
| Количество / stock qty | **Поля нет** — только статус наличия |

Нужно либо `availability`, либо `prices.price` (иначе item → `skipped`).

**Ответ `201` (`BatchOfferUpdateModel`):** `{ requestId, total, items[] }`.

Статусы item (`BatchOfferUpdateItemStatusEnum`):

| status | Смысл |
| --- | --- |
| `skipped` | Валидация, дубликат, или cache no-op (значения уже совпадают) |
| `enqueued` | Принято в очередь |
| `processed` | Обработано (после сообщения processed) |
| `forbidden` | Идентификатор не резолвится для компании |

Дубликаты одного товара: обрабатывается **последний** item, предыдущие `skipped`.

**Опасность для live:** один запрос может сменить цену/наличие до 1000 SKU на проде. См. §9.

---

### 5.2. `GET /v1/offers/update-results/{requestId}` [Док]

Возвращает тот же `BatchOfferUpdateModel` в исходном порядке items.

- Чужой / неизвестный `requestId` → `404` (`batch_update_request.not_found`)
- Невалидный UUID → `404` (`batch_update_request.request_id.invalid`)
- Нужен permission читать batch results

---

### 5.3. `GET /v4/oms/orders` — список заказов [Док]

Рекомендуемая версия списка (есть также `/v3/...`).

**Query:**

| Параметр | Описание |
| --- | --- |
| `limit` | default **25**, min 1 |
| `cursor` | keyset pagination |
| `sort[]` | `subtotal`, `createdAt`, `updatedAt`, `statusCode`, `number`, `fullName` (+ `-` для DESC) |
| `filter[…]` | см. ниже |

**Фильтры (из `omsFilter`):**  
`companyId`, `legalEntityId`, `responsibleId`, `trustedCompany`, `customerId`, `assigneeUserId`, `externalId`, `statusCode[]`, `createdAt[from/to]`, `updatedAt[from/to]`, `number`, `fullName`, `phone`, `paymentProvider`, `paymentStatus`, `shipmentProvider`, `search`, `hasFeedback`, `receiptIssued`, `hasPreOrderItems`.

Для CRM-polling: `filter[updatedAt][from]=…` + `sort[]=updatedAt` + cursor. [Вывод]

**Ответы:** `200` → `OrdersGridResponseModel`; также `400`/`401`/`403`/`404`.

`GET /v4/oms/orders/total` — количество по тому же фильтру.

Детали заказа: **`GET /v6/oms/orders/{orderId}`** (предпочтительно; есть v5).

`orderId` — UUID из URL кабинета: `https://admin.epicentrm.com.ua/oms/orders/{orderId}`. [Док — KB]

---

### 5.4. `POST /v2/oms/orders/{orderId}/change-status/to/{orderStatus}` [Док]

Path `orderStatus` = enum `OrderStatus`:

`new`, `confirmed_by_merchant`, `confirmed`, `sent`, `delivered`, `completed`, `closed`, `canceled`, `returned`, `return_requested`, `canceled_by_merchant`, `completed_merchant_rejection`, `closed_merchant_rejection`.

В list-модели также встречается `received` (`OrderStatusCodeEnum`) — в path-enum `OrderStatus` для change-status **нет** `received`. [Док]

**Тело:** опционально; схема swagger — только `OrderCancelWriteModel` (для отмены):

```json
{
  "reason_code": "Some reason",
  "translationKey": "order.cancel_reason.product_not_available",
  "comment": "Some comment"
}
```

`reason_code` + `translationKey` required в схеме. Длинный enum `translationKey` (merchant/customer cancel reasons) — в swagger.

**KB robotazapi:** тело нужно в двух случаях — при **Скасовано** (причина) и при **Відправлено** (номер ТТН). В swagger для change-status документирована только cancel-модель; отдельный ввод ТТН — через `PATCH /v1/oms/orders/{orderId}/shipment-number` и/или `POST .../shipping/{deliveryProvider}`. [Док оба; точный контракт body для `sent` в swagger — [Не найдено] кроме KB]

**Ответ:** `202` Successful operation; `401`; `404`.

Перед сменой: `GET .../allowed-statuses`. [Док]

---

### 5.5. Shipping / TTN [Док]

| Метод | Путь | Назначение |
| --- | --- | --- |
| POST | `/v3/oms/orders/{orderId}/shipping/{deliveryProvider}` | Создать отправление (`OrderCreateShipmentModelV3`); ответ `201` |
| PATCH | `/v1/oms/orders/{orderId}/shipment-number` | Задать/изменить номер ТТН `{ "number": "…" }` |
| DELETE | `/v1/oms/orders/{orderId}/shipment-number` | Удалить номер ТТН |

Создание shipment: sender (name, lastName, settlementId, officeId, …), dimensions items, `deliveryPayer`, `isPostPayment`, `codAmount`, и т.д. — см. схему в swagger.

KB: после добавления ТТН статус часто уходит в «Відправлено» автоматически. [Док — statusyzamovlen]

---

## 6. XML-фид vs API

| Задача | XML / кабинет | Merchant API |
| --- | --- | --- |
| Создать карточку товара | Да — импорт «Оновити все» (файл или ссылка) или вручную | **Нет** — PIM только read-справочники |
| Название, описание, фото, характеристики, категория | XML YML | Нет |
| Цена, старая цена, наличие | XML полный / короткий + **Автооновлення**; или API | `POST /v1/offers` (если право открыто) |
| Количество штук на складе | **Нет** — только `in_stock` / `under_the_order` / `out_of_stock` (в API availability: `not_available`) | **Нет поля quantity** |
| Заказы, статусы, ТТН | Кабинет | OMS эндпоинты |
| Модерация / отчёт импорта | Только кабинет | [Не найдено] в API |

XML-шаблон и теги: https://supportm.epicentrk.ua/xmlfayl/  
Автооновлення (по умолчанию **1×/сутки в 24:00 UTC**; через менеджера 12 ч / 4 ч / 1 ч): https://supportm.epicentrk.ua/avtoonovlennya/

Коды категорий и атрибутов для XML берут из `GET /v2/pim/...` (нужен токен). [Док]

**Итог:** API **не создаёт** товарные карточки; контент — через XML (или кабинет). API — заказы + (опционально) batch цены/наличия. [Док]

---

## 7. Статусы заказа и SLA 120 минут

### Коды API ↔ кабинет [Док — swagger + statusyzamovlen]

| `statusCode` | Кабинет (UA) |
| --- | --- |
| `new` | Нове |
| `confirmed_by_merchant` | Підтверджено продавцем |
| `confirmed` | Підтверджено |
| `sent` | Відправлено |
| `delivered` | Готове до видачі |
| `completed` | Завершено |
| `closed` | Закрито |
| `canceled` | Скасовано |
| `canceled_by_merchant` | Скасовано продавцем |
| `return_requested` | Запит на повернення |
| `returned` | Повернено |
| `completed_merchant_rejection` | Завершено (відмова продавця) |
| `closed_merchant_rejection` | Закрито (відмова продавця) |
| `received` | Есть в `OrderStatusCodeEnum` list; нет в path-enum change-status |

### SLA [Док — statusyzamovlen]

1. Новый заказ (`new`) → подтвердить (`confirmed_by_merchant`) или отменить **максимум за 120 минут**.
2. Если не успеть — напоминание; ещё **60 минут** без действия → Epicentr отменяет заказ **и может заблокировать компанию**.
3. Рабочее время по умолчанию: пн–пт 9:00–18:00. Заказы вне рабочего времени — до **11:00** следующего рабочего дня.
4. Данные покупателя доступны **после** `confirmed_by_merchant`.
5. Промежуточные статусы > **21 дня** → авто `completed`; **5 дней** на оскарження, иначе `closed` + комиссия.
6. `completed` → через **14 дней** `closed` (списание комиссии), если нет возврата.

Типичная цепочка:  
`new` → `confirmed_by_merchant` → `confirmed` → `sent` → `delivered` → `completed` → `closed`.

Call status API: `success` \| `first_fail` \| `second_fail` \| `email_sent`. [Док]

---

## 8. Sandbox / тестовое окружение

| Вопрос | Ответ | Метка |
| --- | --- | --- |
| Есть ли test/sandbox API? | **Нет.** KB FAQ: «Ми надаємо доступ тільки до прод-версії. Наразі тестового середовища немає.» | [Док] |
| Отражаются ли вызовы сразу в кабинете? | Да | [Док] |
| Отдельный sandbox host в swagger? | Нет (`servers` отсутствует; sandbox/test env = 0 вхождений) | [Док] / [Не найдено] |

**Альтернативы для отладки (осторожно):**

1. Read-only: swagger-контракты, затем согласованные `GET` (PIM categories, один заказ) — см. LIVE-ACCOUNTS-SAFETY.
2. Один согласованный **тестовый SKU** на проде — не весь каталог и не мок `TM-*` из CRM.
3. Не путать с «closed beta» в описании API: это ограничение доступа компаний, **не** отдельная песочница.

---

## 9. LIVE safety — опасные записи

См. также [`LIVE-ACCOUNTS-SAFETY.md`](LIVE-ACCOUNTS-SAFETY.md). Для Epicentr особенно:

| Операция | Риск |
| --- | --- |
| `POST /v1/offers` | Массовая смена цены/наличия до 1000 позиций; идемпотентность 30 мин может скрыть повтор; `not_available` на ошибочном списке SKU останавливает продажи |
| Автооновлення + опция «нет в файле → немає в наявності» | Может обнулить весь каталог, если URL отдал короткий/пустой фид |
| `change-status` → `confirmed_by_merchant` / `canceled` | Реальные заказы, SLA, комиссии, возможная блокировка компании |
| `POST .../shipping/...`, PATCH/DELETE `shipment-number` | Реальные ТТН / отправления |
| PUT/POST/DELETE order items, client-data | Меняет состав и данные живого заказа |
| Загрузка мок-SKU CRM на прод | Запрещено без явного контура |

**Нет поля quantity:** нельзя «списать N штук» через API/фид — только статусы наличия. После продажи Epicentr **сам не снимает** товар с `in_stock`; обновление статуса — наша ответственность. [Док на отсутствие qty; авто-списание — [Вывод]]

**FAQ vs swagger:** пока FAQ говорит, что обмена цен/остатков через API нет — считать `POST /v1/offers` **опциональным правом**, не гарантией. Без права — только автооновлення / ручной импорт.

По умолчанию: только чтение. Любой write — явное «да» в чате.

---

## 10. Источники

| # | Ссылка | Что подтверждает |
| --- | --- | --- |
| S1 | [Swagger UI](https://merchant-api.epicentrm.com.ua/swagger/) | Каталог методов |
| S2 | [swagger.yaml](https://merchant-api.epicentrm.com.ua/swagger/swagger.yaml) | Контракты EN, enums, ошибки offers |
| S3 | [swagger.ukr.yaml](https://merchant-api.epicentrm.com.ua/swagger/swagger.ukr.yaml) | Контракты UA |
| S4 | [Робота з API](https://supportm.epicentrk.ua/robotazapi/) | Токен, роли, нет sandbox, FAQ, change-status body note |
| S5 | [XML імпорт](https://supportm.epicentrk.ua/xmlfayl/) | Контент только XML; PIM GET |
| S6 | [Автооновлення](https://supportm.epicentrk.ua/avtoonovlennya/) | Короткий фид; UTC 24:00; интервалы |
| S7 | [Статуси замовлень](https://supportm.epicentrk.ua/statusyzamovlen/) | SLA 120+60 мин, цепочка, 21/14 дней |
| S8 | [github.com/epicentrm/merchant-api](https://github.com/epicentrm/merchant-api) | Samples (частично устарели vs swagger) |
| S9 | [supportm root](https://supportm.epicentrk.ua/) | Навигация KB |
| S10 | [`epicentr.md`](epicentr.md) | Обзор фида/синхронизации (перепроверять) |
| S11 | [`LIVE-ACCOUNTS-SAFETY.md`](LIVE-ACCOUNTS-SAFETY.md) | Политика live |

### Явно [Не найдено]

- Sandbox / test environment  
- Rate limits / `429`  
- Webhooks  
- API создания/редактирования карточек товара  
- Поле количества остатка в offers API или XML  
- Документированное в swagger тело change-status для `sent` с ТТН (есть только KB + отдельные shipment endpoints)  
- Публичная гарантия, что `POST /v1/offers` открыт на каждом аккаунте (FAQ говорит обратное)

---

*Файл сгенерирован по официальным источникам без вызовов live API. При обновлении swagger — переснять `swagger.yaml` и сверить §4–5.*
