# Rozetka Marketplace Seller API

Конспект Seller API для CRM «Trio Mio». Только официальные источники; эндпоинты не выдуманы.

Дата исследования: **18.10.2026**.  
Спецификация `api_data.json` сгенерирована apidoc: **2026-10-16T15:15:43Z** (530 записей: ~356 уникальных method+path + Models).  
Справка продавца по API — «Останнє оновлення: **26.08.2026**» (`p282`).

Обозначения:

| Метка | Значение |
| --- | --- |
| **[Док]** | Подтверждено официальной документацией / `api_data.json` / sellerhelp |
| **[Не найдено]** | Искали в apidoc, `api_data.json` и sellerhelp — отдельного описания нет |
| **[Вывод]** | Логический вывод из доки; на проде лучше перепроверить |

Смежный контент (XML-фид, бизнес-схема): `docs/integrations/rozetka.md` — **только подсказки**, всё ниже сверено с официальными корнями.  
Живые аккаунты: `docs/integrations/LIVE-ACCOUNTS-SAFETY.md`.

---

## 1. Doc roots & navigation

| Корень | URL | Что внутри |
| --- | --- | --- |
| Seller API apidoc (UI) | https://api-seller.rozetka.com.ua/apidoc/ | Интерактивная apiDoc |
| Полный дамп эндпоинтов | https://api-seller.rozetka.com.ua/apidoc/api_data.json | JSON всех методов, параметров, примеров, Models |
| Мета проекта apidoc | https://api-seller.rozetka.com.ua/apidoc/api_project.json | `url`, `name`, `generator` |
| Зеркало UI в кабинете | https://cabinet-seller.rozetka.com.ua/apidoc/ | Тот же «Rozetka Маркетплейс API» **[Док]** (страница открывается) |
| Справка продавца | https://sellerhelp.rozetka.com.ua/ | XML, API, заказы, остатки, статусы |
| Старт по API | https://sellerhelp.rozetka.com.ua/p282-api-start.html | Токены по ролям, 6 шагов обработки заказа |
| Инструменты (оглавление) | https://sellerhelp.rozetka.com.ua/p305-instrumenty.html | API, Green API, приложение |
| EN PDF (старее) | https://public.rozetka.market/sellerrozetka/s1596/API%20ROZETKA%20eng.pdf | База в PDF иногда `api.seller.rozetka.com.ua` — **не путать** с актуальным host |

### Навигация по группам apidoc (порядок из `api_project.json`)

`AboutAPI` → `Authorization` → … → `ApiItems` → `ItemsCreateModule` → `Orders` → … → `Ttn` / `Ukrposhta` / `Meest` / `Octopus` → `MarketSources` → …

Ключевые якоря UI:

- `#api-AboutAPI-MarketException` — конверт ошибок + текст про Bearer / 24 ч / `Content-Language`
- `#api-Authorization-PostSites` — логин
- `#api-Orders-GetOrderSearch` — поиск заказов
- `#api-Orders-OrderUpdateStatus` — статус / ТТН
- `#api-ApiItems-PutMassUpdateItems` — цена и остаток
- `#api-ApiItems-GetGoodsAll` — список товаров
- `#api-Models-GetOrderStatuses` — справочник ID статусов заказа (не HTTP-метод)

---

## 2. Base URL, auth

### Base URL **[Док]**

Из `api_project.json`:

```text
https://api-seller.rozetka.com.ua
```

Все пути ниже — относительно этого хоста (например `POST https://api-seller.rozetka.com.ua/sites`).

Отдельного sandbox/staging host в официальных корнях **нет** — см. §8.

### Логин → Bearer **[Док]**

| | |
| --- | --- |
| Метод | `POST /sites` |
| Body | `{"username":"<login>","password":"<base64(password)>"}` |
| Header | `Content-Type: application/json` |
| Успех | `content.access_token` → далее `Authorization: Bearer {token}` |

Sellerhelp (`p282`): логин/пароль кабинета; пароль в Base64; после успеха — Bearer.

Из описания группы AboutAPI (`groupDescription` в `api_data.json`):

> После успешной авторизации вы получаете токен (**при использовании постоянно продлевается**; если **не использовать** — срок действия **24 часа**). Авторизация по токену — **Bearer token**.

Logout: `POST /sites/logout` с `Authorization: Bearer {token}` → `content.logout: true`.

Восстановление пароля: `POST /sites/recover-password` (в каталоге Authorization).

### API-токены по ролям **[Док]** (sellerhelp `p282`)

Кабинет → «Налаштування» → «Безпека API» → «Генерувати API-токен».

- Роли: Власник, Адміністратор, Контент-менеджер, Менеджер з фінансів, Менеджер з обробки замовлень.
- Власник/Адмін могут генерировать токены и для других менеджеров; остальные роли — только для своей.
- До **10** токенов на менеджера.
- Если токен **не используется более 24 часов**, он **автоматически становится неактивным**.

Права на конкретные методы в apidoc задаются через `permission` (например `order_edit`, `api_items_actions`, `items_api`).

---

## 3. Response envelope, Content-Language, rate limits

### Конверт **[Док]**

HTTP-статус в примерах почти всегда **200**, даже при ошибке. Успех/ошибка — в теле:

```json
{
  "success": true,
  "content": { }
}
```

```json
{
  "success": false,
  "errors": {
    "message": "incorrect_username_password",
    "code": 1004,
    "details": null
  }
}
```

Поля ошибки (AboutAPI): `success`, `errors.message`, `errors.code`, `errors.details` (строка, массив невалидных атрибутов или `null`).

Частые коды (выборка из AboutAPI):

| Code | Key | Смысл |
| --- | --- | --- |
| 0 | `server_error` | Непредвиденная |
| 1002 | `incorrect_data_format` | Неверный формат |
| 1004 | `incorrect_username_password` | Неверный логин/пароль |
| 1010 | `access_denied` | Нет доступа |
| 1018 | `incorrect_enter_token` | Некорректный токен входа |
| 3002 | `entity_not_end_processed` | Товар заблокирован |
| 5401 | `invalid_credentials` | Неавторизованный доступ к protected-методам |
| 5404 | `not_found` | Не найдено |
| 5503 | `technical_maintenance` | Техобслуживание |
| 6001 | `session_expired` | Сессия истекла |

Полный перечень — группа AboutAPI в apidoc / `api_data.json`.

Пагинация в search-ответах: `_meta.totalCount`, `pageCount`, `currentPage`, `perPage` (или `pageSize` на goods).

### Content-Language **[Док]**

Из AboutAPI:

1. Заголовок `Content-Language: uk|ru` (в части методов в schema также встречается `en`).
2. Если не задан — язык из настроек менеджера (см. ответ логина, поле `lang`).

Для search-методов заказов: опциональный `Accept-Validate-Exception` — получать ошибки валидации (иначе не передавать или `0`).

### Rate limits **[Не найдено]**

В `api_data.json` и sellerhelp (`p282`, `p342`, `p742`, `p352`) **нет** документированных лимитов RPS / 429 / throttle для Seller API.  
(Встречающиеся в JSON совпадения по подстрокам вроде «rate» относятся к другим полям, не к rate limiting.)

Лимит UI кабинета на массовое редактирование наличия/цены: до **100** позиций за раз (`p742` / `p342`) — это **не** документированный лимит `PUT /items/mass-update`.

---

## 4. Catalogue of API areas

Ниже — уникальные method+path из `api_data.json` (без группы Models). Полный дамп: ~356 эндпоинтов; таблицы — по областям, релевантным CRM.

### Authorization

| Method | Path | Title |
| --- | --- | --- |
| `POST` | `/sites` | Логін |
| `POST` | `/sites/recover-password` | Відновлення пароля |
| `POST` | `/sites/logout` | Вихід |

### Orders

| Method | Path | Title |
| --- | --- | --- |
| `GET` | `/orders/counts` | Кількість замовлень |
| `GET` | `/orders/counts-new` | Кількість замовлень |
| `GET` | `/orders/{id}` | Деталі замовлення |
| `GET` | `/orders/search` | Пошук по замовленням |
| `GET` | `/orders/search-data` | Дані для фільтра |
| `GET` | `/v1/orders/search-data` | Дані для фільтра v1 |
| `PUT` | `/orders/{id}` | Статус/ТТН **або** склад (два named-метода в apidoc) |
| `PUT` | `/orders/credit-cancel/{id}` | Відхилення кредиту |
| `PUT` | `/orders/credit-approved/{id}` | Підтвердження кредиту |
| `POST` | `/orders/update-delivery` | Зміна доставки |
| `GET` | `/orders/available-deliveries` | Дані для редагування доставки |
| `POST` | `/orders/update-receiver` | Зміна одержувача |
| `GET` | `/orders/user-info` | Дод. дані про покупця |
| `GET` | `/orders/partial-return-data/{id}` | Частково видані товари |
| `GET` | `/orders/status-payment/{id}` | Статус оплати |
| `GET` | `/payments/payment-statuses` | Статуси платежів |
| `POST` | `/users/create` | Створення покупця |
| `GET` | `/order-statuses/search` | Пошук статусів |
| `GET` | `/status-availables/search` | Допустимі переходи |
| `GET` | `/orders/generate-pdf/{id}` | PDF |
| `PUT` | `/orders/credit-status/{id}` | Статус кредиту |
| `POST` | `/orders/prolong/{id}` | Продовжити резерв |
| `GET` | `/orders/export` | Експорт XLS |
| `GET` | `/orders/create-export-file` | Створити файл експорту |
| `GET` | `/orders/get-export-data` | Дані експорту |
| `GET` | `/orders/download-export-file` | Завантажити експорт |
| `PUT` | `/orders/return-money` | Зворотня доставка коштів |
| `PUT` | `/orders/review-request-status` | Запит на відгук |
| `POST` | `/orders/restore` | Відновлення замовлення |
| `GET` | `/orders/available-payments` | Доступні методи оплати |
| `PUT` | `/orders/update-payment` | Зміна методу оплати |
| `POST` | `/orders/approve-ff-order/{id}` | Підтвердження FF-замовлення |
| `GET` | `/orders/search-delivers` | **[DEPRECATED]** |

Также: `OrderCreate` (`POST /v1/order-create/*`), `OrderRefundModule`, `OrderInvoiceModule`.

### Goods / ApiItems (каталог, цена, остаток, импорт)

| Method | Path | Title |
| --- | --- | --- |
| `GET` | `/goods/counts`, `/v1/goods/counts` | Лічильники |
| `GET` | `/goods/all` | Всі товари |
| `GET` | `/goods/on-sale` | Активні |
| `GET` | `/goods/not-available` | Неактивні |
| `GET` | `/goods/errors` | Помилки |
| `GET` | `/goods/not-valid` | Невалідні |
| `GET` | `/goods/hidden` | Приховані |
| `GET` | `/goods/new` | Нові |
| `GET` | `/goods/changes` | Оновлені |
| `GET` | `/goods/prices` | Оновлені ціни |
| `GET` | `/goods/quarantine` | Ціна поза діапазоном |
| `GET` | `/goods/moderation` | На модерації |
| `GET` | `/goods/archive` | Архівні |
| `GET` | `/goods/details` | Деталі |
| `GET` | `/goods/changes-details` | Деталі змін |
| `GET` | `/goods/search-data*` | Дані фільтрів |
| `PUT` | `/items/mass-update` | Масова зміна ціни і наявності |
| `POST` | `/items/file`, `/items/file/custom` | Експорт файлу |
| `GET` | `/items/file` | Отримання файлів експорту |
| `GET` | `/items-file-import/template` | XLS шаблон |
| `POST` | `/items-file-import/create-items` | Створити через файл |
| `POST` | `/items-file-import/update-items` | Оновити через файл |
| `GET` | `/items-file-import/import-status` | Статус імпорту |
| `GET` | `/items-file-import/imports-list` | Список імпортів |

Справочник sell/status товаров — Models `GET /items/sell-statuses` (описание enum в apidoc).

### Items-create

| Method | Path | Title |
| --- | --- | --- |
| `GET` | `/items-create/categories` | Категорії |
| `GET` | `/items-create/producers` | Виробники |
| `GET` | `/items-create/series` | Серії |
| `GET` | `/items-create/attributes` | Характеристики |
| `GET` | `/items-create/values` | Значення |
| `POST` | `/items-create/create` | Створення товару |
| `PUT` | `/items-create/mass-update-basic-data` | Масове редагування основних даних |

### Categories / price bindings / sources / moderation

| Method | Path | Area |
| --- | --- | --- |
| `GET` | `/market-categories/search` | Категорії Rozetka |
| `GET` | `/market-categories/get-categories-by-parent` | Дерево |
| `GET` | `/v1/market-categories/category-options` | Параметри JSON |
| `GET` | `/market-categories/download-options` | XLS параметрів |
| `GET` | `/price-markets/price` | Прайси |
| `GET` | `/price-markets/categories-by-price` | Категорії прайсу |
| `POST` | `/price-markets/create-bindings-categories` | Зв'язка категорій |
| `GET` | `/price-markets/params-for-category` | Параметри зв'язок |
| `GET` | `/markets/sources-list` | Джерела / фіди (read) |
| `GET` | `/moderation-request` | Заявки на модерацію |
| `GET` | `/moderation-request/{id}` | Деталі заявки |
| `GET` | `/grouping-service/group-strategy/search` | Правила групування |

### TTN / доставка

| Group | Примеры path |
| --- | --- |
| `Ttn` (Нова Пошта) | `POST /ttns/create-ttn`, `GET /ttns/ttn-list`, print endpoints |
| `TtnSetting` | ключ НП, адреса, налаштування |
| `Ukrposhta` | `POST /ukrposhta/create-ttn`, locality/search, print |
| `Meest` | `POST /meests/create-ttn`, … |
| `Octopus` (RZ Delivery) | `POST /delivery-rozetka/create-order-ttn`, registry, print |
| `DeliveryManagement` | localities, pickups, streets, services |

### Прочее (кратко)

`Messages`, `ItemComments`, `MarketReviews`, `Balances` / consolidated / logistic, `KitsModule`, `Fulfillment`, `PrroModule`, `SellerNotifyOptions`, `TimeTable`, `Sellers`, `Calls`, `FeedbackController`, `RozetkaPayModule`, `Uploader`, `Green API` (отдельный продукт, `p524` — не Seller API каталог).

**Вебхуки входящих заказов:** в полном `api_data.json` и sellerhelp API **[Не найдено]**. Уведомления продавцу — Telegram / Viber/SMS / email (`SellerNotifyOptions.channel_new_order`: 0/1/2), не HTTP callback на наш сервер.

---

## 5. Detailed contracts

### 5.1 Auth — `POST /sites` **[Док]**

**Request**

```http
POST /sites
Content-Type: application/json

{
  "username": "seller_login",
  "password": "<Base64(plain_password)>"
}
```

**Success (фрагмент из примера apidoc)**

```json
{
  "success": true,
  "content": {
    "id": 111,
    "access_token": "…",
    "permissions": ["order_edit", "correspondence"],
    "roles": ["guest", "default_owner"],
    "seller": { "fio": "…", "email": "…", "first_phone": { } },
    "market": {
      "id": 1086,
      "business_model": "b2c",
      "title": "…",
      "status": "6",
      "status_label": "Активний"
    },
    "lang": "ru"
  }
}
```

**Error example:** `success: false`, `code: 1004` (`incorrect_username_password`).

Дальнейшие запросы:

```http
Authorization: Bearer {access_token}
Content-Language: uk
```

---

### 5.2 Orders search — `GET /orders/search` **[Док]**

| | |
| --- | --- |
| Permission | `order_edit` |
| Default | группа статусов «В обробці» (sellerhelp); параметр `type` default `1` |

**Ключевые query-параметры**

| Param | Notes |
| --- | --- |
| `types` | `1` всі · `2` в обробці · `3` успішні · `4` нові · `5` доставляються · `6` неуспішні (заменяет `type`) |
| `status` | ID статуса |
| `created_from` / `created_to` | `YYYY-MM-DD` |
| `changed_from` / `changed_to` | |
| `status_updated_from` / `status_updated_to` | |
| `id`, `item_id`, `ttn`, `user_phone`, … | фильтры |
| `is_viewed` | `0`/`1` |
| `page` | default `1` |
| `sort` | default `-id`; allowed: `id`, `created`, `changed`, `amount`, `status`, `last_update_status`, … с `+/-` |
| `expand` | `purchases`, `status_available`, `delivery`, `user`, `order_status_history` (в примерах), … |

**Response shape**

```json
{
  "success": true,
  "content": {
    "orders": [ { "id": 248888186, "status": 1, "status_group": 1, "ttn": "", "…": "…" } ],
    "_meta": { "totalCount": 1, "pageCount": 1, "currentPage": 1, "perPage": 20 },
    "totalFields": { "amount": "…", "cost": "…" }
  }
}
```

Детали одного заказа: `GET /orders/{id}?expand=purchases,status_available,delivery,user,…`.

Рекомендованный sellerhelp flow (`p282`): login → search → details → `expand=status_available` → update status.

---

### 5.3 Order update status — `PUT /orders/{id}` (OrderUpdateStatus) **[Док]**

| | |
| --- | --- |
| Headers | `Authorization: Bearer …`, `Content-Type: application/json` |
| Description | Зміна статусу, додавання ТТН і коментаря продавця |

**Body**

| Field | Req. | Notes |
| --- | --- | --- |
| `status` | да | Новый статус (ID) |
| `seller_comment` | нет | Комментарий продавца |
| `ttn` | условно | **Обязателен** при переходе в **3** и **61**. Необязателен при **2**; если ТТН передан со статусом **2** → авто **61**. После ТТН трекинг идёт сам — дальше статусы вручную не нужны |
| `duplicate_order_id` | условно | **Обязателен** при статусе **49** |

Path param: `id` — ID заказа. Query: `expand=…`.

Отдельный named-метод на том же path: **OrderUpdatePurchases** — изменение состава/количества (см. title «Редагування замовлення (товари, кількість)»); для CRM не смешивать с update status.

---

### 5.4 Items mass-update — `PUT /items/mass-update` **[Док]**

| | |
| --- | --- |
| Permission | `api_items_actions` |
| Описание | Зміна ціни і кількості. Если цена ↑ более чем в **1,5** раза или ↓ в **2** раза — не применяется сразу, уходит на подтверждение менеджером |

**Body**

```json
{
  "isIgnoreCheck": 0,
  "items": [
    {
      "item_rz_id": 102069758,
      "price": 45003,
      "stock_quantity": 11
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `isIgnoreCheck` | `0` — валидация; описание допускает `1` — без валидации. В schema `allowedValues` указан только `0` — поведение `1` **уточнять осторожно** |
| `items[].item_rz_id` | ID товара в Rozetka; в модели: брать из ItemsAll / goods (`rz_item_id`) |
| `items[].price` | грн; необязателен, если есть `stock_quantity` |
| `items[].stock_quantity` | остаток; необязателен, если есть `price` |
| `items[].price_old` | `-1` удаляет |
| `items[].price_promo` | `-1` удаляет |
| `items[].min_cart_quantity` / `max_cart_quantity` | `-1` удаляет |

Успех: `{"success":true,"content":null}`.  
Частичные ошибки валидации по `item_rz_id` — в `errors` (пример в apidoc с `reason[]`).

**Предусловие кабинета** (`p742`): тип синхронизации прайса **«Особистий кабінет (API)»**, иначе источником цены/наличия остаётся XML.

---

### 5.5 Goods list — `GET /goods/all` **[Док]**

| | |
| --- | --- |
| Permission | `items_api` / `order_create` (как в apidoc) |
| Pagination | `page` (default 1), `pageSize` (default **100**) |

**Полезные фильтры:** `price_offer_id`, `article`, `rz_item_id`, `sync_source_id`, `available` (`0`/`1`/`2`), `rz_sell_status`, `name`, `find_by_text`, `is_virtual_source` (`0` прайс · `3` API), цены from/to, `expand=description,description_ua`.

**Поля item (важные для sync):** `rz_item_id`, `price_offer_id`, `article`, `price`, `price_old`, `price_promo`, `stock_quantity`, `available`, `rz_sell_status`, `rz_status` / `upload_status`, `sync_source` (в т.ч. `availability`).

Маппинг для mass-update: `price_offer_id` (наш offer id в фиде) → `rz_item_id` → `item_rz_id` в `PUT /items/mass-update`.

---

## 6. XML YML feed vs API

| Канал | Что обновляет | Частота / как | Источник |
| --- | --- | --- | --- |
| **XML YML** по URL | Контент + (по умолчанию) цена/наличие/остаток | Pull Rozetka, стандартно **раз в час**; ручная sync в кабинете ≤ 1× / 3 ч | sellerhelp `p352`, `p342`, `p185` |
| Тип sync **«Прайс-лист»** | Всё из XML | XML — источник истины | `p352`, `p742` |
| Тип sync **«Особистий кабінет (API)»** | Цена, наявність, стара/промо ціна, min/max корзины — из кабинета/API | `PUT /items/mass-update` или UI | `p742` |
| Возврат типа на «Прайс-лист» | Значения из кабинета/API **перезапишутся** XML | — | `p742` |

**[Вывод]** Практическая схема CRM: XML несёт контент (название, описание, фото, param); цена и остаток — API после переключения типа на «Особистий кабінет (API)». Документация формулирует «актуальною буде інформація з кабінету», но **прямо не пишет** «XML content продолжает синкаться, а price/stock из XML игнорируются» — проверить на одном тестовом offer.

Rozetka при заказе **сама** вычитает остаток; при отмене — возвращает. Если остатки идут из XML, следующая sync перезапишет фидом — продавец обязан сам вести остатки в своей системе (`p342`).

Подключение/замена URL фида — только через поддержку (`p352`). Эндпоинта «force sync feed» в API **[Не найдено]** (`GET /markets/sources-list` — только чтение метаданных источников).

Создание заявки на модерацию через API **[Не найдено]** (есть чтение `GET /moderation-request*`).

---

## 7. Order status IDs for automation

Полный список — Models `GetOrderStatuses` / live `GET /order-statuses/search`. Ниже — статусы, которые чаще всего нужны автоматизации (ID + название из apidoc Models).

### Happy path / обработка

| ID | Название | Заметка |
| --- | --- | --- |
| **1** | Нове замовлення | Старт; sellerhelp: перевести в «обробляється менеджером» |
| **26** | Опрацьовується менеджером | Редактирование заказа; цель после приёма |
| **47** | Планується повторний дзвінок | |
| **55** | Очікує отримання оплати | |
| **2** | Комплектується. Дані підтверджені | ТТН опционален; с ТТН → авто 61 |
| **61** | Заплановано передачу перевізникові | ТТН обязателен при ручном переходе |
| **3** | Передано в службу доставки | ТТН обязателен |
| **4** | Доставляється | Часто по трекингу |
| **5** | Чекає в пункті самовивозу | |
| **6** | Замовлення виконано | Успех |
| **80** | Чекає на отримання від Продавця | RZ Delivery / магазины (sellerhelp) |

### Авто / дедлайны (sellerhelp `p236`)

| ID | Название | Заметка |
| --- | --- | --- |
| **7** | Не оброблено продавцем протягом дня | Авто, если новый не принят за 24 ч по графику; через 7 дней → выполнено |
| **87** | Виконано. Минув термін обробки | Авто после ~30 дней в обработке |
| **25** / **44** | Тестове / Фейкове замовлення | Тестовый контур без sandbox API — см. §8 |

### Отмены / возвраты (фрагмент)

| ID | Название |
| --- | --- |
| **42** | Немає в наявності |
| **45** | Скасовано покупцем |
| **18** | Не вдалося зв'язатися |
| **28** | Неправильні контактні дані |
| **49** | Повторне замовлення (`duplicate_order_id` обязателен при PUT) |
| **86** | Очікується повернення товару |
| **19** | Замовлення повернено |

Группы в ответах search: `status_group` (в примерах `1` = в обработке). Фильтр `types=4` — новые.

Допустимые переходы: `expand=status_available` на заказе или `GET /status-availables/search` — **не угадывать** enum на проде.

---

## 8. Sandbox

### Verdict: **отдельного публичного sandbox / test API environment НЕТ** **[Не найдено]**

Проверено:

- `api_project.json` → единственный `url`: `https://api-seller.rozetka.com.ua`
- Поиск по `api_data.json` / sellerhelp (`p282`, `p305`, инструменты) на sandbox / пісочниця / api-test host
- Веб-поиск по `api-seller.rozetka.com.ua` + sandbox/staging

**Что есть вместо sandbox** **[Док]** (`p238`):

1. Оформить **тестове замовлення** на реквизиты владельца магазина.
2. После проверки сообщить в поддержку номер заказа.
3. Статус станет **«Фейкове замовлення»** (исключение из показателя успешности).

Третьи стороны (Odoo и т.п.) иногда имеют свой «Test Environment» — это **режим модуля**, не хост Rozetka. **[Не найдено]** как официальный sandbox Rozetka.

**[Вывод] для Trio Mio:** отладка контрактов — только read-only на живом кабинете + один согласованный тестовый offer / фейковый заказ. См. `LIVE-ACCOUNTS-SAFETY.md`.

---

## 9. LIVE-account safety

Клиент уже продаёт на Rozetka. Любая запись бьёт по реальному каталогу и заказам.

### Особенно опасные write-вызовы

| Вызов | Риск |
| --- | --- |
| `PUT /items/mass-update` | Затирание **цены/остатка** пачкой; `stock_quantity: 0` останавливает продажи; резкие цены → карантин / подтверждение |
| `PUT /orders/{id}` (status/TTN) | Ложные статусы, рейтинг, автозакрытия; неверный ТТН |
| `POST /ttns/create-ttn`, `/delivery-rozetka/create-order-ttn`, Meest/Ukrposhta create | Реальные накладные и деньги на доставку |
| `PUT /orders/{id}` (purchases) | Ломает состав заказа |
| `POST /items-create/create`, file-import update | Порча контента / дубли на модерации |
| Смена типа sync / URL фида | Только кабинет/поддержка; может перезаписать API-цены XML-ом |

### Правила (согласовано с `LIVE-ACCOUNTS-SAFETY.md`)

1. По умолчанию **только GET** (search, goods, statuses, sources-list).
2. Любой `POST`/`PUT`/`DELETE` — только после **явного «да»** в чате.
3. Не выгружать mock SKU CRM на живой каталог без тестового контура.
4. Mass-update: dry-run списка `item_rz_id` + абсолютные остатки, не «обнулить всё».
5. Не менять статусы заказов «для проверки» на проде.
6. Ключи/токены — только env / secrets, не в git (репо публичный).

Переключение прайса на «Особистий кабінет (API)» — действие в кабинете; тоже согласовать, иначе XML начнёт снова затирать ручные/API цены.

---

## 10. Source links

### Seller API

- https://api-seller.rozetka.com.ua/apidoc/
- https://api-seller.rozetka.com.ua/apidoc/api_data.json
- https://api-seller.rozetka.com.ua/apidoc/api_project.json
- https://cabinet-seller.rozetka.com.ua/apidoc/
- PDF (EN, старее): https://public.rozetka.market/sellerrozetka/s1596/API%20ROZETKA%20eng.pdf

### Seller help

- API: https://sellerhelp.rozetka.com.ua/p282-api-start.html
- Инструменты: https://sellerhelp.rozetka.com.ua/p305-instrumenty.html
- Цена/наличие в кабинете (тип API): https://sellerhelp.rozetka.com.ua/p742-price-and-stock-managment.html
- Наличие и остатки: https://sellerhelp.rozetka.com.ua/p342-avaliable-and-stock.html
- Управление прайсами: https://sellerhelp.rozetka.com.ua/p352-source-management.html
- Требования XML: https://sellerhelp.rozetka.com.ua/p185-pricelist-requirements.html
- Статусы заказа: https://sellerhelp.rozetka.com.ua/p236-order-status.html
- Обработка заказа: https://sellerhelp.rozetka.com.ua/p235-order-processing.html
- Создание / тестовое заказ: https://sellerhelp.rozetka.com.ua/p238-create-order.html
- Green API (не Seller API): https://sellerhelp.rozetka.com.ua/p524-greenapi.html

### Внутренние

- Обзор интеграции (фид + схема): `docs/integrations/rozetka.md`
- Правила живых аккаунтов: `docs/integrations/LIVE-ACCOUNTS-SAFETY.md`
