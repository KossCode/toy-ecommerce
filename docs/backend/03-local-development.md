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

# 2. Бэкенд (миграции применятся при старте)
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local

# 3. Админка (в другом терминале, из корня репозитория)
npm install
VITE_API_PROXY=http://localhost:8080 npm run dev:web
```

- Админка: http://localhost:5173
- API: http://localhost:8080/api
- OpenAPI UI: http://localhost:8080/api/docs (спецификация — `/api/docs/openapi.json`)
- Health: http://localhost:8080/actuator/health, http://localhost:8080/healthz
- База: `localhost:15432`, база/пользователь/пароль `triomio` — только для локального контейнера. Порт не `5432`, чтобы не конфликтовать с Postgres из Homebrew или установщика EDB на той же машине.

Если `java -version` показывает не 25, укажите JDK явно: `export JAVA_HOME=$(/usr/libexec/java_home -v 25)` (или путь Homebrew `/opt/homebrew/opt/openjdk@25`).

Прокси Vite для `/api` задаётся переменной `VITE_API_PROXY`. Без неё он смотрит на Express-мок (`3001`), и `npm run dev` работает как раньше. Пока эндпоинты не перенесены (этап 7), данные админки отдаёт Express-мок; на этапе 7 Java API становится значением по умолчанию, а `npm run dev` перестаёт запускать `server/`.

Без локальной базы приложение можно поднять на временном Postgres из Testcontainers: `./mvnw spring-boot:test-run`. Нужен запущенный Docker.

## 3. Профили Spring

| Профиль | Где | Что включено |
| --- | --- | --- |
| `local` | ноутбук разработчика | демо-данные из `data/*.json`, фото на диск (`./.local-media`), OpenAPI UI, читаемые логи, все площадки в `OFF` |
| `test` | тесты | Testcontainers, WireMock вместо площадок |
| `prod` | EC2 | JSON-логи, S3, OpenAPI UI выключен, демо-загрузчик не создаётся |

Профиля `staging` нет: окружение одно.

## 4. Демо-данные

В профиле `local` при пустой базе `DemoSeedRunner` загружает `data/products.json`, `orders.json`, `categories.json`, `prices.json`. Все товары получают `is_demo = true`. Такие товары никогда не попадают в фиды и outbox — это вторая линия защиты после правила «не мешать мок-SKU с живым каталогом» ([`../integrations/LIVE-ACCOUNTS-SAFETY.md`](../integrations/LIVE-ACCOUNTS-SAFETY.md) п. 3).

Сбросить базу:

```bash
docker compose -f deploy/docker-compose.dev.yml down -v
docker compose -f deploy/docker-compose.dev.yml up -d postgres
```

## 5. Переменные окружения

Локально все значения по умолчанию лежат в `application-local.yml`; секретов там нет. Если нужно что-то переопределить — файл `backend/.env.local` (маски `*.local` и `.env.*` уже в `.gitignore`). Формат — Java properties (`spring.datasource.password=...`); профиль `local` подключает его через `spring.config.import`, если файл есть. Путь относительный, поэтому запускайте приложение из `backend/`.

Живые ключи площадок локально **не используются**. Для отладки интеграции допустим только токен тестовой компании Prom, и только в `.env.local`. Режим площадки локально по умолчанию `OFF`; поднять его можно максимум до `READ_ONLY` без отдельного согласования.

## 6. Полный образ локально

Проверить то, что поедет на сервер:

```bash
docker build -f deploy/Dockerfile -t triomio-crm:local .
docker compose -f deploy/docker-compose.dev.yml --profile app up
```

Образ собирается под архитектуру машины. На Apple Silicon это arm64, как на EC2. В контекст сборки попадают только файлы из allowlist в `.dockerignore`; `.env*`, `.local-config/` и `.git` туда не попадают.

Пока клиент API не переключён (этап 7.2), прод-сборка админки внутри образа работает на браузерном моке — так задумано, чтобы образ уже сейчас показывал данные.

## 7. Частые проблемы

| Симптом | Причина | Что сделать |
| --- | --- | --- |
| `Connection refused` к 15432 | контейнер базы не поднят | `docker compose -f deploy/docker-compose.dev.yml ps` |
| `ports are not available ... address already in use` | порт `15432` или `8080` занят другим процессом | `nc -z 127.0.0.1 15432`; остановить чужой процесс или поменять порт в `docker-compose.dev.yml` и `application-local.yml` |
| Тесты: `Could not find a valid Docker environment` | Docker не запущен | запустить Docker Desktop / OrbStack |
| Flyway: `checksum mismatch` | изменили уже применённую миграцию | вернуть файл; изменения — новой миграцией. Локально можно сбросить базу (§4) |
| 401 на всё в админке | нет сессии | войти под демо-пользователем из `application-local.yml` |
| 403 на POST | нет CSRF-заголовка | клиент должен слать `X-XSRF-TOKEN` ([`05-api.md`](05-api.md) §4) |
