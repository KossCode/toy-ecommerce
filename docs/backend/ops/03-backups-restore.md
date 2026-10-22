# Бэкапы и восстановление

Назад к плану: [`../README.md`](../README.md), этап 4.

PostgreSQL живёт в Docker на том же EC2, без RDS ([`../README.md`](../README.md) §1). Поэтому бэкапы и регулярная проверка восстановления — наша ответственность, а не AWS.

## 1. Цели

| Метрика | Цель | Как достигается |
| --- | --- | --- |
| RPO — сколько данных можем потерять | ≤ 1 час | `pg_dump` каждый час |
| RTO — за сколько восстанавливаемся | ≤ 2 часа при потере сервера, ≤ 30 минут при порче базы | runbook ниже + учения |

Что теряется в худшем случае за час: ручные заказы, правки товаров, ручные правки остатков. Заказы площадок не теряются — после восстановления их заново забирает опрос (§4, шаг 5).

## 2. Слои бэкапов

| Слой | Что | Как часто | Сколько хранится | Где |
| --- | --- | --- | --- | --- |
| Дамп базы | `pg_dump --format=custom` | каждый час | 48 часов | `s3://<backups>/hourly/` |
| | копия часового дампа в 02:15 UTC | ежедневно | 35 дней | `daily/` |
| | копия ежедневного дампа 1-го числа | ежемесячно | 12 месяцев | `monthly/` |
| | дамп перед каждым деплоем | при деплое | 14 дней | `predeploy/` |
| Снапшот диска | EBS через Data Lifecycle Manager | ежедневно 03:00 UTC | 7 штук | EBS snapshots |
| Фото | версионирование бакета `media` | при каждом изменении | 30 дней для удалённых | S3 |

Не бэкапим: фиды (пересобираются), сертификаты Let's Encrypt (certbot выпустит заново), `.env` (собирается из Parameter Store), образы (в ECR).

## 3. Дамп по расписанию

`deploy/scripts/backup-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
source /opt/triomio/.env
KIND="${1:-hourly}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="${KIND}/triomio-${TS}.dump"

docker compose -f /opt/triomio/docker-compose.prod.yml exec -T postgres \
  pg_dump -U triomio -d triomio --format=custom --compress=9 \
  | aws s3 cp - "s3://${BACKUP_BUCKET}/${KEY}" --sse AES256

if [[ "$KIND" == "hourly" && "$(date -u +%H)" == "02" ]]; then
  aws s3 cp "s3://${BACKUP_BUCKET}/${KEY}" "s3://${BACKUP_BUCKET}/daily/triomio-${TS}.dump"
  if [[ "$(date -u +%d)" == "01" ]]; then
    aws s3 cp "s3://${BACKUP_BUCKET}/${KEY}" "s3://${BACKUP_BUCKET}/monthly/triomio-${TS}.dump"
  fi
fi

if [[ "$KIND" == "hourly" ]]; then
  curl -fsS -m 10 --retry 3 "${HEARTBEAT_URL}" > /dev/null
fi
```

Запуск — таймер systemd, а не Quartz: бэкап должен работать, даже если приложение лежит.

```ini
# /etc/systemd/system/triomio-backup.service
[Unit]
Description=Trio Mio hourly DB backup
[Service]
Type=oneshot
ExecStart=/opt/triomio/scripts/backup-db.sh hourly

# /etc/systemd/system/triomio-backup.timer
[Unit]
Description=Run DB backup hourly
[Timer]
OnCalendar=*-*-* *:15:00
Persistent=true
[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload && systemctl enable --now triomio-backup.timer
systemctl list-timers | grep triomio
```

**Контроль.** Внешний heartbeat-сервис (healthchecks.io или аналог) ждёт пинг раз в час с допуском 30 минут. Не дождался → письмо. Это ловит всё сразу: упал скрипт, упал сервер, кончились права.

## 4. Восстановление

### 4.1 Проверка дампа (учение, раз в месяц)

```bash
LATEST=$(aws s3 ls "s3://${BACKUP_BUCKET}/hourly/" | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://${BACKUP_BUCKET}/hourly/${LATEST}" /tmp/restore.dump

docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=test postgres:17
sleep 10
docker cp /tmp/restore.dump pg-restore-test:/tmp/restore.dump
docker exec pg-restore-test createdb -U postgres triomio
docker exec pg-restore-test pg_restore -U postgres -d triomio --no-owner /tmp/restore.dump
docker exec pg-restore-test psql -U postgres -d triomio -c \
  "select (select count(*) from products) products, (select count(*) from orders) orders, (select max(updated_at) from orders) last_order_change"

docker rm -f pg-restore-test && rm /tmp/restore.dump
```

Сравнить числа с боевой базой; записать результат в журнал (§6).

### 4.2 Порча данных или неудачная миграция (сервер жив)

1. **Сразу остановить запись в площадки:** в Parameter Store `integrations-max-mode = READ_ONLY` → `render-env.sh`. Иначе после восстановления приложение отправит на площадки устаревшие остатки.
2. `docker compose stop app`.
3. Выбрать дамп: `predeploy/` при неудачном деплое, иначе последний `hourly/` до момента порчи.
4. Восстановить в боевой контейнер:
   ```bash
   docker compose exec -T postgres dropdb -U triomio triomio
   docker compose exec -T postgres createdb -U triomio triomio
   aws s3 cp "s3://${BACKUP_BUCKET}/<key>" - | docker compose exec -T postgres pg_restore -U triomio -d triomio --no-owner
   ```
5. Сдвинуть курсоры опроса заказов на час раньше времени дампа (`update integration_settings set orders_cursor = ...`), чтобы опрос заново забрал заказы, пришедшие после дампа.
6. `docker compose up -d app` с образом, который соответствует схеме дампа.
7. Дождаться опроса, запустить `ReconcileJob` вручную, разобрать расхождения.
8. Вернуть `integrations-max-mode` после «да» владельца.

### 4.3 Потеря сервера

Быстрый путь — из снапшота EBS:

1. EC2 → Snapshots → последний снапшот → Create volume → Launch instance с этим томом по параметрам из [`../aws/02-ec2-server.md`](../aws/02-ec2-server.md) §1.
2. Перенести Elastic IP на новый инстанс.
3. До старта приложения выставить `integrations-max-mode = READ_ONLY` (см. 4.2, шаг 1).
4. Снапшот старше последнего часового дампа → восстановить базу из дампа по 4.2.

Медленный путь (снапшот недоступен): новый инстанс по runbook с нуля → `render-env.sh` → `docker compose up -d postgres` → восстановление по 4.2.

## 5. Фото

Удалённое или перезаписанное фото в бакете `media` восстанавливается из предыдущей версии объекта в течение 30 дней: S3 → объект → Versions → скопировать нужную версию поверх.

## 6. Журнал учений

| Дата | Что проверяли | Дамп | Время | Результат | Кто |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
