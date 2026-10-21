# Модель данных (PostgreSQL)

Назад к плану: [`README.md`](README.md). Поля товара берутся из [`../admin/product-fields.md`](../admin/product-fields.md); правила остатков, цен и категорий — из [`../integrations/README.md`](../integrations/README.md).

## 1. Соглашения

| Тема | Правило |
| --- | --- |
| Имена | `snake_case`, таблицы во множественном числе |
| Ключи | `bigint generated always as identity`; наружу товар идентифицируется `sku`, заказ — `number` |
| Время | `timestamptz`, хранится в UTC; бизнес-часовой пояс `Europe/Kyiv` применяется при отображении и в cron-расписаниях |
| Деньги | `numeric(12,2)` в БД, `BigDecimal` в Java; на площадки уходят значения после округления по правилу |
| Перечисления | `text` + `CHECK (... IN (...))`, а не типы `enum` PostgreSQL: проще добавлять значения миграцией |
| Оптимистичная блокировка | колонка `version int` у товаров и заказов; конфликт → `409` |
| Удаление | товары не удаляются, а уходят в `ARCHIVE`; физическое удаление только у служебных журналов по сроку |
| Аудит | `created_at`, `updated_at`, `updated_by` у изменяемых сущностей; подробная история — в `audit_log` |

## 2. Таблицы

### 2.1 Пользователи и сессии

| Таблица | Ключевые колонки |
| --- | --- |
| `users` | `id`, `email` (unique, lower), `password_hash`, `full_name`, `role` (`OWNER` / `MANAGER`), `is_active`, `must_change_password`, `last_login_at` |
| `login_attempts` | `email`, `ip`, `at`, `success` — для ограничения перебора |
| `spring_session`, `spring_session_attributes` | схема Spring Session JDBC, создаётся миграцией |

### 2.2 Каталог

| Таблица | Ключевые колонки |
| --- | --- |
| `brands` | `id`, `name` (unique) |
| `brand_mappings` | `brand_id`, `marketplace`, `external_id`, `external_name`; PK `(brand_id, marketplace)` |
| `categories` | `id`, `parent_id`, `name`, `sort_order` — наше дерево, оно же меню будущего сайта |
| `marketplace_categories` | `marketplace`, `external_id`, `parent_external_id`, `name`, `is_leaf`, `attribute_set_code`, `synced_at`; PK `(marketplace, external_id)` |
| `marketplace_category_attributes` | `marketplace`, `category_external_id`, `code`, `name`, `is_required`, `value_type`, `values jsonb`, `synced_at` |
| `category_mappings` | `category_id`, `marketplace`, `external_category_id`, `attribute_set_code`; PK `(category_id, marketplace)` |
| `products` | `id`, `sku` (unique, вид `TM-10018`), `status` (`DRAFT` / `ACTIVE` / `ARCHIVE`), `is_demo`, `brand_id`, `category_id`, `name_uk`, `name_ru`, `description_uk`, `description_ru`, `model`, `barcode`, `country_uk`, `country_ru`, `weight_kg`, `length_cm`, `width_cm`, `height_cm`, фиксированные атрибуты (`color_*`, `age_group_*`, `material_*`, `type_*`, `parts_count`, `series_*`, `condition_*`), `base_price`, `old_price`, `duplicate_of`, `version` |
| `product_channels` | `product_id`, `marketplace`, `enabled`, `external_id` (`TM10018`), `name_override`, `moderation_status`, `last_error`, `last_synced_at`; PK `(product_id, marketplace)` |
| `product_images` | `id`, `product_id`, `storage_key`, `position`, `content_type`, `size_bytes`, `width`, `height` |

Список фиксированных атрибутов не придумываем — он ровно такой, как в [`../admin/product-fields.md`](../admin/product-fields.md). Новый атрибут = новая миграция и новая строка в той таблице.

Внешний ID для Rozetka и Epicentr (`TM10018`) вычисляется из `sku` при создании `product_channels` и дальше не меняется: на Epicentr артикул после публикации правит только менеджер площадки.

### 2.3 Остатки и цены

| Таблица | Ключевые колонки |
| --- | --- |
| `stock` | `product_id` (PK), `total`, `reserve`, `available` (`generated always as (greatest(total - reserve, 0)) stored`), `awaiting`, `updated_at`; `CHECK (total >= 0 AND reserve >= 0)` |
| `price_rules` | `id`, `marketplace`, `scope` (`DEFAULT` / `CATEGORY` / `BRAND` / `PRODUCT`), `scope_ref_id`, `kind` (`BASE` / `PERCENT` / `AMOUNT` / `EXACT`), `value`, `rounding`, `updated_at` |

`available` — то самое «доступно», которое уходит на площадки. Порог «Закінчується» — в `settings`.

### 2.4 Заказы

| Таблица | Ключевые колонки |
| --- | --- |
| `orders` | `id`, `number` (наш, вид `TM-10482`), `channel` (`PROM` / `ROZETKA` / `EPICENTR` / `INSTAGRAM` / `MANUAL` / `SITE`), `external_id`, `status`, `external_status`, `placed_at`, `confirm_deadline_at`, `customer_name`, `customer_phone`, `city`, `delivery_method`, `delivery_address`, `warehouse`, `payment_method`, `ttn`, `ttn_status`, `comment`, `cancel_reason`, `total`, `external_updated_at`, `raw_payload jsonb`, `version`; `UNIQUE (channel, external_id)` |
| `order_items` | `id`, `order_id`, `product_id` (nullable — SKU с площадки может не найтись), `sku`, `name`, `qty`, `price`, `old_price` |
| `order_status_history` | `id`, `order_id`, `from_status`, `to_status`, `at`, `actor`, `source` (`USER` / `POLL` / `SYSTEM`) |

`raw_payload` — последний ответ площадки по заказу. Он нужен для разбора спорных случаев и для маппинга статусов, которые мы ещё не видели. Персональные данные в нём хранятся по той же политике, что и в колонках ([`ops/05-security.md`](ops/05-security.md) §5).

### 2.5 Интеграции и фоновые задачи

| Таблица | Ключевые колонки |
| --- | --- |
| `integration_settings` | `marketplace` (PK), `mode` (`OFF` / `READ_ONLY` / `DRY_RUN` / `LIVE`), `credentials_ciphertext bytea`, `credentials_hint` (последние 4 символа), `credentials_updated_at`, `orders_cursor`, `paused_reason`, `updated_by` |
| `sync_outbox` | `id`, `marketplace`, `kind` (`STOCK` / `PRICE` / `ORDER_STATUS`), `product_id` / `order_id`, `payload jsonb`, `dedupe_key`, `status` (`PENDING` / `IN_PROGRESS` / `DONE` / `DRY_RUN` / `BLOCKED` / `FAILED`), `attempts`, `next_attempt_at`, `last_error`, `created_at`, `processed_at` |
| `sync_log` | `id`, `marketplace`, `operation`, `http_method`, `path`, `http_status`, `duration_ms`, `request_excerpt`, `response_excerpt`, `at` — без токенов и заголовков авторизации; хранится 30 дней |
| `feed_builds` | `id`, `marketplace`, `started_at`, `finished_at`, `items_count`, `status`, `errors jsonb` |
| `job_runs` | `id`, `job_name`, `started_at`, `finished_at`, `status`, `error`; хранится 30 дней |
| `qrtz_*` | схема Quartz для PostgreSQL (`tables_postgres.sql` из дистрибутива Quartz), создаётся миграцией |

Уникальный частичный индекс `ON sync_outbox (dedupe_key) WHERE status = 'PENDING'` даёт схлопывание: новая отправка остатка по тому же SKU и площадке обновляет уже ждущую строку, а не добавляет вторую ([`08-marketplace-sync.md`](08-marketplace-sync.md) §3).

### 2.6 Прочее

| Таблица | Ключевые колонки |
| --- | --- |
| `audit_log` | `id`, `at`, `actor_user_id` (null = «Система»), `entity_type`, `entity_id`, `sku`, `kind` (`Поля` / `Ціна` / `Наявність` / `Статус` / `Інтеграція` / `Користувачі`), `text`, `diff jsonb` |
| `settings` | `key` (PK), `value jsonb` — порог «Закінчується», параметры оповещений |

## 3. Остатки и конкурентность

Остаток меняют одновременно менеджер в админке, опрос заказов и (позже) сайт. Правила:

1. Любое изменение — одним атомарным `UPDATE stock SET reserve = reserve + :qty WHERE product_id = :id RETURNING available`, без чтения-изменения-записи в Java.
2. В той же транзакции пишутся `audit_log` и строки `sync_outbox` с абсолютным значением `available`.
3. Резерв меняется по переходу статуса заказа (новый → резерв; отмена → снять; отправка → `total` и `reserve` вниз одинаково), а не по факту получения заказа. Повторный опрос того же заказа резерв не задваивает.
4. `CHECK` в БД — последняя линия защиты: отрицательный остаток вызовет ошибку транзакции, а не тихую порчу данных.

Тест конкурентности — критерий приёмки шага 5.3 в [`README.md`](README.md).

## 4. Миграции

- Файлы: `backend/src/main/resources/db/migration/V{N}__{описание}.sql`.
- Применяются Flyway при старте приложения. Перед деплоем с миграцией скрипт деплоя делает внеочередной дамп ([`ops/02-deploy.md`](ops/02-deploy.md)).
- Применённую миграцию не редактируем никогда — только новая.
- Схема меняется в стиле expand/contract: сначала добавляем (колонку, таблицу), выкатываем код, который пишет в оба места, потом убираем старое отдельной миграцией. Так откат приложения на предыдущий образ не ломается о новую схему.
- В миграциях нет данных пользователей, паролей и хешей — репозиторий публичный.

## 5. Первичная загрузка реального каталога

Источник — выгрузка каталога из кабинета Prom (CSV/YML), [`../ROADMAP.md`](../ROADMAP.md) этап 1. Импорт — отдельная команда приложения, которую запускают на сервере вручную:

1. Импорт в режиме «показать, что будет создано» → отчёт.
2. Владелец смотрит отчёт.
3. Импорт с записью; все товары создаются в `DRAFT`, каналы выключены.

Демо-данные из `data/` в prod не попадают ([`03-local-development.md`](03-local-development.md) §4).
