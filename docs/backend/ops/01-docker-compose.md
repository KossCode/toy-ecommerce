# Контейнеры на сервере

Назад к плану: [`../README.md`](../README.md), шаг 3.4. Файлы живут в `deploy/` репозитория и копируются в `/opt/triomio` на сервере при деплое.

## 1. Сервисы

| Сервис | Образ | Порты на хосте | Память (лимит) |
| --- | --- | --- | --- |
| `caddy` | `caddy:2-alpine` (конкретная версия фиксируется при настройке) | `80`, `443/tcp`, `443/udp` | 128 MiB |
| `app` | `<registry>/triomio/crm:<sha>` | `127.0.0.1:8080` | 1.5 GiB |
| `postgres` | `postgres:17` | нет | 768 MiB |

Итого ≈ 2.4 GiB из 4 GiB на `t4g.medium`; остальное — ОС, Docker, page cache. Swap 2 GiB — страховка ([`../aws/02-ec2-server.md`](../aws/02-ec2-server.md) §5).

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
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    environment:
      ADMIN_HOST: ${ADMIN_HOST}
      ACME_EMAIL: ${ACME_EMAIL}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app: { condition: service_healthy }
    mem_limit: 128m
    logging: *awslogs
    profiles: ["public"]          # не стартует, пока нет домена

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
  caddy_data:
  caddy_config:
  feeds:
  pgdata:
```

Пояснения:

- Порт PostgreSQL на хост не пробрасывается — база доступна только из Docker-сети.
- Приложение слушает только `127.0.0.1`: снаружи к нему не попасть, но работает проброс порта SSM до покупки домена.
- `-XX:+ExitOnOutOfMemoryError`: при нехватке памяти JVM завершается, и Docker её перезапускает, вместо того чтобы зависнуть.
- Лог-группу `/triomio/prod` создаём заранее в CloudWatch с хранением 30 дней ([`04-monitoring.md`](04-monitoring.md) §1).
- После появления домена Caddy запускается так: `docker compose --profile public up -d`.

## 3. `deploy/Caddyfile`

```caddyfile
{
	email {$ACME_EMAIL}
}

{$ADMIN_HOST} {
	encode zstd gzip

	@internal path /actuator/*
	respond @internal 404

	request_body {
		max_size 25MB
	}

	header {
		Strict-Transport-Security "max-age=300"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}

	reverse_proxy app:8080
}
```

`max-age` у HSTS повышается по [`../aws/04-domain-tls.md`](../aws/04-domain-tls.md) §5. Content-Security-Policy задаёт приложение, потому что ему известны собственные ассеты.

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
| `ADMIN_HOST`, `ACME_EMAIL` | `/triomio/prod/app/*` |
| `BACKUP_BUCKET`, `HEARTBEAT_URL` | для скриптов бэкапа |

`deploy/scripts/render-env.sh` читает `aws ssm get-parameters-by-path --path /triomio/prod --recursive --with-decryption`, собирает `.env` и выставляет права. Править `.env` руками нельзя: следующий рендер перезапишет изменения. Меняем параметр в Parameter Store → `render-env.sh` → `docker compose up -d`.

## 5. Частые команды

```bash
cd /opt/triomio
docker compose ps
docker compose logs -f --tail=200 app       # при драйвере awslogs — смотреть в CloudWatch
docker compose restart app
docker compose exec postgres psql -U triomio -d triomio
docker system df && docker image prune -f  # если заканчивается диск
```
