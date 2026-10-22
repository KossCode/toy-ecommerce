# Контейнеры на сервере

Назад к плану: [`../README.md`](../README.md), шаг 3.4. Файлы живут в `deploy/` репозитория и копируются в `/opt/triomio` на сервере при деплое.

## 1. Что где работает

| Что | Где | Порты | Память |
| --- | --- | --- | --- |
| nginx + certbot | на хосте, systemd | `80`, `443` наружу | ≈ 30 MiB |
| `app` | контейнер `<registry>/triomio/crm:<версия>` | `127.0.0.1:8080` | лимит 1.5 GiB |
| `postgres` | контейнер `postgres:17` | нет | лимит 768 MiB |

Итого ≈ 2.3 GiB из 4 GiB на `t4g.medium`; остальное — ОС, Docker, page cache. Swap 2 GiB — страховка ([`../aws/02-ec2-server.md`](../aws/02-ec2-server.md) §5).

nginx стоит на хосте, а не в контейнере, как в Lexio: он продолжает отвечать, пока контейнер приложения перезапускается, и отдаёт страницу 503 вместо обрыва соединения.

## 2. `deploy/docker-compose.prod.yml`

Эскиз. Окончательные версии образов и параметры фиксируются в шаге 3.4.

```yaml
name: triomio

x-awslogs: &awslogs
  driver: awslogs
  options:
    awslogs-region: eu-central-1
    awslogs-group: /triomio/prod
    tag: "{{.Name}}"
    mode: non-blocking
    max-buffer-size: 4m

services:
  app:
    image: ${ECR_REGISTRY}/triomio/crm:${APP_TAG}
    restart: unless-stopped
    env_file: .env
    environment:
      SPRING_PROFILES_ACTIVE: prod
      JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
    ports: ["127.0.0.1:8080:8080"]
    volumes:
      - feeds:/data/feeds
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/actuator/health/readiness"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 90s
    stop_grace_period: 60s
    mem_limit: 1536m
    logging: *awslogs

  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_DB: triomio
      POSTGRES_USER: triomio
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    command:
      - postgres
      - -c
      - shared_buffers=192MB
      - -c
      - effective_cache_size=512MB
      - -c
      - max_connections=40
      - -c
      - log_min_duration_statement=1000
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U triomio -d triomio"]
      interval: 10s
      timeout: 5s
      retries: 10
    shm_size: 256m
    mem_limit: 768m
    logging: *awslogs

volumes:
  feeds:
  pgdata:
```

Пояснения:

- Порт PostgreSQL на хост не пробрасывается — база доступна только из Docker-сети.
- Приложение слушает только `127.0.0.1`: снаружи к нему не попасть; nginx на хосте и проброс порта SSM (до покупки домена) ходят именно сюда.
- `-XX:+ExitOnOutOfMemoryError`: при нехватке памяти JVM завершается, и Docker её перезапускает, вместо того чтобы зависнуть.
- Лог-группу `/triomio/prod` создаём заранее в CloudWatch с хранением 30 дней ([`04-monitoring.md`](04-monitoring.md) §1).

## 3. nginx на хосте

### `deploy/nginx/admin.conf`

Шаблон сайта до выпуска сертификата. `__ADMIN_HOST__` подставляется при установке ([`../aws/04-domain-tls.md`](../aws/04-domain-tls.md) §4); затем `certbot --nginx` сам добавляет `listen 443 ssl`, пути к сертификату и редирект с HTTP.

```nginx
server {
    listen 80;
    server_name __ADMIN_HOST__;
    server_tokens off;

    client_max_body_size 25m;

    # Пока приложение перезапускается — страница «Оновлюємо систему» с кодом 503
    error_page 502 503 504 =503 /50x.html;
    location = /50x.html {
        internal;
        root /var/www/triomio;
        add_header Cache-Control "no-store" always;
    }

    location /actuator/ {
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_intercept_errors on;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript application/xml image/svg+xml;
    gzip_min_length 1000;

    add_header Strict-Transport-Security "max-age=300" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

- `proxy_intercept_errors on` подменяет на страницу 503 и ошибки `5xx` самого приложения. Для JSON API это значит, что админка получит HTML вместо `problem+json`, поэтому клиент обрабатывает `503` отдельно: «Система оновлюється, спробуйте за хвилину». Если это начнёт мешать — включать перехват только для `location /` без `/api/`.
- Кешированием ассетов управляет приложение ([`02-deploy.md`](02-deploy.md) §1); nginx заголовки кеша не трогает.
- `max-age` у HSTS повышается по [`../aws/04-domain-tls.md`](../aws/04-domain-tls.md) §5. Content-Security-Policy задаёт приложение: ему известны собственные ассеты.

### `deploy/nginx/50x.html`

Статическая страница на украинском без внешних ресурсов: логотип inline-SVG, текст «Оновлюємо систему. Спробуйте через хвилину», автообновление через 30 секунд (`<meta http-equiv="refresh" content="30">`).

### Изменение конфига после certbot

После `certbot --nginx` живой файл `/etc/nginx/sites-available/triomio-admin` содержит строки certbot. Поэтому изменение `admin.conf` в репозитории применяется так:

```bash
sed "s/__ADMIN_HOST__/admin.<domain>/g" /opt/triomio/nginx/admin.conf > /etc/nginx/sites-available/triomio-admin
certbot --nginx -d admin.<domain> --reinstall --redirect --non-interactive
nginx -t && systemctl reload nginx
```

certbot заново вставит сертификат (без перевыпуска) и редирект. `deploy.sh` конфиг nginx не трогает; при деплое обновляется только `50x.html`.

## 4. `.env`

На сервере `/opt/triomio/.env`, права `600`, владелец `root`. В репозитории — только `deploy/.env.example` с именами переменных без значений.

| Переменная | Откуда |
| --- | --- |
| `ECR_REGISTRY` | `<ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com` |
| `APP_TAG` | пишет `deploy.sh` |
| `DB_PASSWORD` | `/triomio/prod/db/password` |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://postgres:5432/triomio` |
| `SPRING_DATASOURCE_USERNAME` | `triomio` |
| `SPRING_DATASOURCE_PASSWORD` | `/triomio/prod/db/password` |
| `APP_CRYPTO_MASTER_KEY` | `/triomio/prod/crypto/master-key` |
| `APP_FEEDS_TOKEN` | `/triomio/prod/feeds/token` |
| `APP_S3_MEDIA_BUCKET` | `/triomio/prod/s3/media-bucket` |
| `INTEGRATIONS_MAX_MODE` | `/triomio/prod/app/integrations-max-mode` |
| `APP_VERSION` | пишет `deploy.sh` (= `APP_TAG`) |
| `ADMIN_HOST` | `/triomio/prod/app/admin-host`; нужен `smoke.sh` |
| `BACKUP_BUCKET`, `HEARTBEAT_URL` | для скриптов бэкапа |

`deploy/scripts/render-env.sh` читает `aws ssm get-parameters-by-path --path /triomio/prod --recursive --with-decryption`, собирает `.env` и выставляет права. Править `.env` руками нельзя: следующий рендер перезапишет изменения. Меняем параметр в Parameter Store → `render-env.sh` → `docker compose up -d`.

### `validate-env.sh`

Как в Lexio: запускается перед каждым `docker compose up` из `deploy.sh` и останавливает деплой, если в `.env` нет обязательной переменной или она пустая. Список обязательных — массив в начале скрипта; он же сверяется с `deploy/.env.example` в CI, чтобы новая переменная не забылась ни в одном из мест. Значения скрипт не печатает — только имена отсутствующих.

## 5. Частые команды

```bash
cd /opt/triomio
docker compose ps
docker compose logs -f --tail=200 app       # при драйвере awslogs — смотреть в CloudWatch
docker compose restart app
docker compose exec postgres psql -U triomio -d triomio
docker system df && docker image prune -f  # если заканчивается диск
```
