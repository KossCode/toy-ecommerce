# Фоновые задачи (Quartz)

Назад к плану: [`README.md`](README.md). Что именно джобы делают с площадками — [`08-marketplace-sync.md`](08-marketplace-sync.md).

## 1. Настройка

Quartz работает внутри приложения, состояние хранит в той же PostgreSQL (JDBC JobStore). Расписания, следующие запуски и пропуски переживают перезапуск контейнера.

```yaml
spring:
  quartz:
    job-store-type: jdbc
    jdbc:
      initialize-schema: never          # таблицы qrtz_* создаёт Flyway
    wait-for-jobs-to-complete-on-shutdown: true
    overwrite-existing-jobs: true       # Trigger-бины системных джоб; orders/feed — из job_schedules
    properties:
      org.quartz.scheduler.instanceName: triomio
      org.quartz.scheduler.instanceId: AUTO
      org.quartz.jobStore.driverDelegateClass: org.quartz.impl.jdbcjobstore.PostgreSQLDelegate
      org.quartz.jobStore.isClustered: false   # true, когда появится второй экземпляр
      org.quartz.jobStore.misfireThreshold: 60000
      org.quartz.threadPool.threadCount: 5
server:
  shutdown: graceful
```

Схема `qrtz_*` — миграция Flyway, скопированная из `tables_postgres.sql` той версии Quartz, что в `pom.xml`. При обновлении Quartz сверяем схему.

## 2. Правила для всех джоб

- Каждая джоба помечена `@DisallowConcurrentExecution`: следующий запуск не начнётся, пока не закончился предыдущий.
- Джоба — тонкая обёртка: логика лежит в сервисе модуля и тестируется без Quartz.
- Каждый запуск пишется в `job_runs` (через `JobListener`): начало, конец, статус, ошибка.
- Cron-выражения — в часовом поясе `Europe/Kyiv`.
- Всё, что меняет данные на площадке, идёт только через outbox и проверку режима ([`08-marketplace-sync.md`](08-marketplace-sync.md) §2). Ни одна джоба не вызывает изменяющие методы API площадки напрямую.
- Бэкапы базы — **не** Quartz, а таймер systemd на сервере: они должны работать, даже когда приложение лежит ([`ops/03-backups-restore.md`](ops/03-backups-restore.md)).

## 3. Каталог джоб

| Джоба | Расписание | Что делает | Пишет в площадку | При пропуске |
| --- | --- | --- | --- | --- |
| `OrdersPollJob` (по одной на площадку) | по умолчанию каждые 90 с; правит OWNER в «Інтеграції» | Читает заказы, изменённые после курсора (минус 5 минут перекрытия); upsert; переходы статусов → резерв → outbox | нет, только чтение | пропустить: следующий запуск догонит по курсору |
| `OutboxDispatchJob` | каждые 15 с (код, не UI) | Берёт до 50 строк `PENDING` с наступившим `next_attempt_at` (`FOR UPDATE SKIP LOCKED`), применяет режим площадки и предохранители, отправляет | да, только в `LIVE` | пропустить |
| `FeedBuildJob` (по одной на площадку: `PROM.FeedBuild` …) | по умолчанию ежедневно 00:05 Kyiv; правит OWNER | Собирает YML площадки в `app.feeds.dir`, пишет `feed_builds`; отдача `GET /feeds/{token}/{mp}.xml` | нет: площадка сама забирает фид | выполнить один раз |
| `ConfirmDeadlineJob` | каждую минуту | Ищет заказы с дедлайном подтверждения в ближайшие 30 минут (Epicentr — 2 часа на подтверждение) → оповещение | нет | пропустить |
| `ReconcileJob` | ежедневно 03:30 | Читает цены и остатки с площадки, сравнивает с CRM, строит отчёт расхождений. Ничего не исправляет автоматически | нет | выполнить один раз |
| `DictionariesRefreshJob` | вс 04:00 + по кнопке | Обновляет кэш категорий и атрибутов Rozetka и Epicentr (у Prom — загрузка файла) | нет | выполнить один раз |
| `HousekeepingJob` | ежедневно 04:30 | Чистит `sync_log`, `job_runs`, `DONE`-строки outbox старше 30 дней, старые `login_attempts` | нет | выполнить один раз |

Интервал опроса заказов — 90 секунд, в рамках «раз в 1–2 минуты» из [`../integrations/README.md`](../integrations/README.md). Лимиты запросов площадок нигде не задокументированы ([`../integrations/prom-api.md`](../integrations/prom-api.md) §3), поэтому чаще не опрашиваем.

## 4. Управление

- Запуск вне расписания — `POST /api/jobs/{name}/trigger` (только владелец), под капотом `Scheduler.triggerJob`. Имена: `OrdersPoll.PROM`, `FeedBuild.ROZETKA`, `OutboxDispatch`, …
- Расписание опроса заказов и пересборки фида — таблица `job_schedules` (источник правды). `PUT /api/integrations/{id}/schedules/{orders|feed}` пишет JSON и делает `rescheduleJob`. Payload: `INTERVAL` (everySeconds + опционально daysOfWeek + windowStart/windowEnd) или `CALENDAR` (раз в день о hour:minute + daysOfWeek). Ограничения дней/окна — Quartz Calendar на SimpleTrigger. Системные джобы (`OutboxDispatch`, …) остаются Trigger-бинами в коде.
- Пауза площадки — не пауза джобы, а режим `OFF` в `integration_settings`: джобы продолжают работать, но для этой площадки ничего не делают. Так одно действие останавливает и опрос, и отправку.
- На странице «Інтеграції»: блок «Підключення» (режим записи, URL фіду + «Копіювати») і «Розклад CRM» (інтервал / календар Europe/Kyiv, «Запустити зараз»). Частоту скачивания фіду в кабінеті площадки тут не змінюємо.

## 5. Мониторинг джоб

| Условие | Реакция |
| --- | --- |
| Нет успешного `OrdersPollJob` площадки дольше 10 минут | бизнес-алерт ([`ops/04-monitoring.md`](ops/04-monitoring.md) §4) |
| В outbox есть строки `FAILED` | бизнес-алерт + красный статус в «Інтеграціях» |
| `FeedBuildJob` упал | бизнес-алерт; площадка продолжит читать предыдущий файл |
| Джоба выполняется дольше своего интервала 3 раза подряд | предупреждение в логах, разбор |
