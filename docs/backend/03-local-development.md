# Локальная разработка

Назад к плану: [`README.md`](README.md).

## 1. Что нужно установить

| Инструмент | Версия | Как поставить на macOS |
| --- | --- | --- |
| JDK | 25 (Temurin) | `brew install --cask temurin@25` или SDKMAN |
| Docker | Docker Desktop или OrbStack | с сайта / `brew install --cask orbstack` |
| Node.js | 22 (как в CI Pages) | `brew install node@22` или nvm |
| AWS CLI v2 | последняя | `brew install awscli` — нужен только для работы с AWS, не для разработки |

Maven ставить не нужно — в репозитории `backend/mvnw`.

## 2. Первый запуск

```bash
# 1. База
docker compose -f deploy/docker-compose.dev.yml up -d postgres

# 2. Демо-пароль для owner@demo.local / manager@demo.local
cp backend/.env.local.example backend/.env.local
# отредактируйте app.demo.user-password (минимум 12 символов)

# 3. Бэкенд (миграции и Quartz при старте; профиль local)
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local

# 4. Админка (из корня репозитория) — прокси на Java :8080
npm install
npm run dev:java
```

- Админка: http://localhost:5173
- API: http://localhost:8080/api
- OpenAPI UI: http://localhost:8080/api/docs
- Health: http://localhost:8080/actuator/health, http://localhost:8080/healthz
- База: `localhost:15432`, база/пользователь/пароль `triomio` (только локальный контейнер)

Если `java -version` не 25: `export JAVA_HOME=$(/usr/libexec/java_home -v 25)`.

`npm run dev:java` задаёт `VITE_API_PROXY=http://localhost:8080`. Сборка Pages (`npm run build:pages`) по-прежнему использует браузерный мок (`VITE_USE_BROWSER_API=true`), без Java.

Без локальной базы: `./mvnw spring-boot:test-run` (Testcontainers, нужен Docker).

## 3. Профили Spring

| Профиль | Где | Что включено |
| --- | --- | --- |
| `local` | ноутбук | демо-данные из `data/*.json`, OpenAPI UI, DEBUG-логи, площадки → `OFF` (без ключей), Quartz + `MockMarketplaceClient` |
| `test` | тесты | Testcontainers, тот же mock-клиент |
| `prod` | EC2 | JSON-логи, S3, OpenAPI выключен, демо-сидер не создаётся |

## 4. Демо-данные и Quartz

В профиле `local` при пустой базе `DemoSeedRunner` загружает `data/*.json`. Все товары — `is_demo = true` (не попадают в outbox и фиды).

Площадки без credentials при старте local принудительно в режиме `OFF`. Потолок `app.integrations.max-mode` / `INTEGRATIONS_MAX_MODE` по умолчанию `DRY_RUN`. Джобы Quartz крутятся по расписанию и пишут `job_runs`; HTTP к реальным API нет — только `MockMarketplaceClient` и строки в `sync_log`.

Ручной запуск джобы (владелец): `POST /api/jobs/{name}/trigger` (например `OutboxDispatch`, `OrdersPoll.PROM`, `FeedBuild.PROM`). Список: `GET /api/jobs`.

Фид локально: `APP_FEEDS_TOKEN` / `APP_PUBLIC_BASE_URL` в `.env.local` (см. `.env.local.example`). URL вида `http://localhost:8080/feeds/{token}/prom.xml`. Демо-SKU (`is_demo`) в фид не попадают — файл может быть пустым по offers, пока нет боевых товаров. Расписания orders/feed правятся в UI «Інтеграції» → «Розклад CRM» и сразу меняют Quartz.

Сбросить базу:

```bash
docker compose -f deploy/docker-compose.dev.yml down -v
docker compose -f deploy/docker-compose.dev.yml up -d postgres
```

## 5. Переменные окружения

Секреты и пароль демо — только в `backend/.env.local` (см. `.env.local.example`). Формат — Java properties. Профиль `local` подключает файл через `spring.config.import`; запускайте приложение из `backend/`.

Живые ключи площадок локально **не используются**.

## 6. Полный образ локально

```bash
docker build -f deploy/Dockerfile -t triomio-crm:local .
docker compose -f deploy/docker-compose.dev.yml --profile app up
```
