# Технологический стек

Назад к плану: [`README.md`](README.md).

Точные версии фиксируются в `backend/pom.xml` и `deploy/*.yml` при создании проекта (шаг 2.1). Ниже — линейки и причины выбора. Если на момент старта вышла новая минорная версия, берём её; переход на новую мажорную — отдельным решением.

## 1. Основа

| Слой | Выбор | Почему |
| --- | --- | --- |
| Язык | Java 25 LTS (Eclipse Temurin) | LTS, виртуальные потоки для блокирующих HTTP-вызовов к площадкам без реактивщины |
| Фреймворк | Spring Boot 4.x | Стандарт для Java-бэкенда; из коробки Security, Data, Quartz, Actuator, structured logging |
| Сборка | Maven + Maven Wrapper (`mvnw`) | Привычно, предсказуемо; wrapper не требует установки Maven |
| Веб | Spring Web MVC + виртуальные потоки (`spring.threads.virtual.enabled=true`) | Простая блокирующая модель кода, достаточная производительность |
| База | PostgreSQL 17 | Решение владельца ([`../ROADMAP.md`](../ROADMAP.md)); `jsonb`, `FOR UPDATE SKIP LOCKED` для outbox |
| Миграции | Flyway | SQL-миграции в репозитории, применяются при старте приложения |
| Доступ к данным | Spring Data JPA (Hibernate) для CRUD; `JdbcClient` для отчётов и массовых операций | JPA экономит время на типовых сущностях; сложные запросы пишем SQL-ем |
| Планировщик | Quartz (`spring-boot-starter-quartz`), JDBC JobStore | Решение владельца; расписания и состояние в PostgreSQL, переживают рестарт |
| Безопасность | Spring Security + Spring Session JDBC | Свой логин, сессии в БД ([`06-auth-and-roles.md`](06-auth-and-roles.md)) |
| Валидация | Jakarta Bean Validation | Аннотации на DTO, единый формат ошибок |
| Ошибки API | `ProblemDetail` (RFC 9457) | Встроено в Spring; единый формат ([`05-api.md`](05-api.md)) |
| Документация API | springdoc-openapi (линейка, совместимая с Boot 4) | OpenAPI → генерация TypeScript-типов для админки |
| HTTP-клиенты | Spring `RestClient` | Синхронный, простой, хорошо тестируется WireMock |
| Устойчивость | Resilience4j: rate limiter, retry, circuit breaker | Лимиты площадок не документированы — ограничиваем себя сами ([`08-marketplace-sync.md`](08-marketplace-sync.md)) |
| XML-фиды | StAX (`javax.xml.stream`) | Потоковая запись, низкая память на любом размере каталога |
| AWS | AWS SDK for Java v2 (S3) | Фото товаров ([`09-media-s3.md`](09-media-s3.md)) |
| Кеш в памяти | Caffeine | Справочники и настройки; Redis не нужен |
| Логи | Logback + встроенный structured logging Spring Boot (JSON в prod) | CloudWatch читает строки JSON |
| Метрики | Micrometer + Actuator | Health для мониторинга, метрики джоб |
| DTO | Java `record` | Без Lombok: records закрывают DTO, сущности пишем явно |
| Модульность | Spring Modulith (только проверка границ в тесте) | Не даёт модулям лезть в чужие репозитории |

## 2. Тесты и качество

| Что | Выбор |
| --- | --- |
| Тесты | JUnit 5, AssertJ, Spring Boot Test, MockMvc |
| База в тестах | Testcontainers PostgreSQL 17 (та же версия, что на проде) |
| API площадок в тестах | WireMock с фикстурами из документации; живые ключи в CI не используются никогда |
| Форматирование | Spotless + palantir-java-format, проверка в CI |
| Зависимости | Dependabot: Maven, npm, Docker, GitHub Actions |
| Секреты | gitleaks в CI |

Подробно — [`10-testing.md`](10-testing.md).

## 3. Инфраструктура

| Слой | Выбор | Почему |
| --- | --- | --- |
| Облако | AWS, `eu-central-1` | Решение владельца; Франкфурт — ближайший полноценный регион к Украине |
| Сервер | EC2 `t4g.medium` (ARM Graviton), Ubuntu Server 24.04 LTS arm64 | Graviton дешевле x86 той же мощности; Ubuntu — официальный apt-репозиторий Docker и `unattended-upgrades` из коробки |
| Контейнеры | Docker Engine + Compose v2 | Монолит + БД + прокси одной командой |
| Прокси и TLS | nginx на хосте + certbot (`python3-certbot-nginx`) | Та же схема, что работает в Lexio: знакомый конфиг, готовая страница 503 на время деплоя, автопродление сертификатов через `certbot.timer` |
| Реестр образов | Amazon ECR (private) | Доступ с EC2 по instance role без паролей |
| CI/CD | GitHub Actions; runner `ubuntu-24.04-arm` для нативной сборки arm64 | Уже используется для Pages; OIDC-доступ в AWS без ключей |
| Секреты | SSM Parameter Store, SecureString | Бесплатный стандартный уровень; не нужен Secrets Manager |
| Логи и алармы | CloudWatch Logs (драйвер `awslogs`), CloudWatch Agent, SNS | Без своего стека мониторинга |
| Доступ к серверу | SSM Session Manager | Без открытого SSH и без ключей |
| Внешний мониторинг | бесплатный тариф Better Stack / UptimeRobot / healthchecks.io | Проверка «снаружи» и heartbeat бэкапов |

## 4. Фронт админки

Остаётся как есть: React 19, Vite, Tailwind, TypeScript ([`../../package.json`](../../package.json)). Меняется только клиент API: типы генерируются из OpenAPI (`openapi-typescript`), прод-сборка ходит в реальный API ([`05-api.md`](05-api.md) §5).

## 5. Отклонённые альтернативы

| Альтернатива | Почему нет |
| --- | --- |
| Node.js/TypeScript (развивать текущий Express-мок) | Выбрана Java + Quartz; Express-мок остаётся только до паритета |
| ECS Fargate | Дороже (≈ $60–90/мес) и сложнее для одного монолита |
| Lambda + API Gateway | Длинные опросы и фоновые джобы неудобны; сложнее локальная разработка |
| RDS PostgreSQL | +$15–20/мес; на старте заменяем часовыми дампами и снапшотами. Риск принят, условие пересмотра — [`README.md`](README.md) §1 |
| CloudFront | Не нужен до сайта-витрины |
| Terraform / CDK | Одно окружение, один сервер — ручной runbook быстрее |
| Kafka / SQS / RabbitMQ | Outbox в PostgreSQL закрывает задачу без нового сервиса |
| Redis | Сессии в PostgreSQL, кеш в памяти |
| Cognito | Для пары пользователей CRM избыточен |
| Spring WebFlux | Виртуальные потоки дают ту же пользу при простом коде |
| MinIO / LocalStack для локального S3 | Лишний контейнер ради одной операции; локально фото пишутся на диск через тот же интерфейс ([`09-media-s3.md`](09-media-s3.md)) |
| Caddy (прокси с автоматическими сертификатами) | Рабочий вариант, но nginx + certbot уже отлажен в Lexio — берём знакомое |
| JWT RS256 + refresh-токены (как в Lexio) | Для пары пользователей CRM на одном домене серверные сессии проще: нет ротации ключей, выход мгновенный, Redis не нужен |

## 6. Сравнение с Lexio

Lexio (`learning-platform`) — соседний проект на похожем стеке, уже работающий в проде на EC2. Что из него взяли и где расходимся:

| Аспект | Lexio | Trio Mio CRM | Почему так |
| --- | --- | --- | --- |
| Java / Spring Boot | 21 / 3.5 | 25 / 4.x | Новый проект — сразу на актуальные LTS |
| Прокси и TLS | nginx на хосте + certbot, страница 503 | **так же** | Отлажено |
| Фронт | отдельный контейнер с nginx | внутри образа приложения | Один образ, одна версия, меньше памяти |
| Авторизация | JWT RS256 + refresh в Redis | сессии в PostgreSQL | См. §5 |
| Redis | есть | нет | Нечего в нём хранить |
| Фоновые задачи | `@Scheduled` | Quartz JDBC JobStore | Расписания и пропуски переживают рестарт; запуск по кнопке |
| Секреты | Secrets Manager (≈ $0.40 за секрет) | Parameter Store SecureString (бесплатно) | Ротация через Secrets Manager не нужна |
| Сборка образов | на сервере, переход на GHCR в планах | в GitHub Actions → ECR | Сервер не тратит память на сборку; откат — `pull` готового образа |
| Доставка файлов на сервер | `rsync` по SSH | `deploy.sh` по SSM Run Command | Порт 22 закрыт, ключей нет |
| Доступ к серверу | SSH | SSM Session Manager | То же |
| Бэкапы | `pg_dump` раз в сутки, cron | раз в час, systemd timer, lifecycle S3 | Ручные заказы — деньги; удаление делает S3, а не скрипт |
| Мониторинг | Actuator + UptimeRobot | + CloudWatch алармы и бизнес-алерты | Сроки подтверждения заказов площадок |
| Релизы | версия, заметка в `docs/releases/`, тег, `CURRENT_TAG` | **так же** | Видно, что и когда задеплоено |
| `deploy.sh` | validate-env → up → liveness → readiness → smoke | **так же** + бэкап перед деплоем + автооткат | |
| Правило миграций | `safe-db-migrations.mdc` | **так же**, адаптировано | [`../../.cursor/rules/safe-db-migrations.mdc`](../../.cursor/rules/safe-db-migrations.mdc) |
| Локальные ID ресурсов | `.local-config/aws-resources.env` | **так же** | ID аккаунта и инстанса не попадают в публичный репозиторий |
| Регион | `eu-north-1` | `eu-central-1` | Отдельный аккаунт; Франкфурт — решение этого проекта |
