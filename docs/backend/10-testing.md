# Тестирование и CI

Назад к плану: [`README.md`](README.md).

## 1. Что тестируем и чем

| Уровень | Что | Инструменты |
| --- | --- | --- |
| Модульные | правила цен и округление, расчёт `available`, готовность товара к площадке, маппинг статусов площадок, генерация XML фида | JUnit 5, AssertJ |
| Интеграционные с БД | репозитории, миграции, конкурентные резервы, outbox (`SKIP LOCKED`, схлопывание) | Testcontainers PostgreSQL 17 |
| Контроллеры | контракты API, права ролей, CSRF, формат ошибок | Spring Boot Test, MockMvc, Spring Security Test |
| Клиенты площадок | запросы и разбор ответов, режимы `DRY_RUN`/`READ_ONLY`, повторы | WireMock |
| Границы модулей | модули не лезут в чужие репозитории | Spring Modulith `ApplicationModules.verify()` |
| После деплоя | `/healthz`, вход, список товаров | скрипт в `deploy/scripts/smoke.sh` |

## 2. Обязательные тесты

Без них шаг в плане не закрывается:

- Конкурентный резерв одного SKU из 50 потоков ([`04-data-model.md`](04-data-model.md) §3).
- Все миграции применяются на пустую базу.
- В `DRY_RUN` и `READ_ONLY` к площадке не уходит ни одного изменяющего запроса (WireMock `verify(0, ...)`).
- `LIVE` недостижим при потолке `INTEGRATIONS_MAX_MODE` ниже `LIVE`.
- Предохранитель массового обнуления срабатывает на пороге.
- Товары `is_demo` не попадают ни в фид, ни в outbox.
- Матрица ролей из [`06-auth-and-roles.md`](06-auth-and-roles.md) §3.
- Демо-загрузчик не создаётся в профиле `prod`.

## 3. Фикстуры площадок

- Ответы API для WireMock берём из документации и конспектов [`../integrations/*-api.md`](../integrations/README.md). Реальные ответы из боевых кабинетов в репозиторий не кладём: в них персональные данные покупателей.
- Живые ключи в CI и тестах не используются никогда. В GitHub Secrets ключей площадок нет.

## 4. CI (GitHub Actions)

Workflow `ci.yml` на каждый PR в `master`:

1. `backend`: `./mvnw -B verify` (включает Spotless check и все тесты). Testcontainers работает на стандартных runner'ах GitHub.
2. `frontend`: `npm ci && npm run build` и проверка, что `src/api/schema.d.ts` совпадает со спецификацией.
3. `secrets`: gitleaks по диффу PR.

Существующий `deploy-pages.yml` не трогаем — он собирает демо на браузерном моке. Деплой бэкенда — отдельный ручной workflow ([`ops/02-deploy.md`](ops/02-deploy.md)).

Branch protection на `master`: все три проверки обязательны.
