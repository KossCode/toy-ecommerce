# AWS: домен и HTTPS

Назад к плану: [`../README.md`](../README.md), шаг 3.6.

Домен ещё не куплен ([`../README.md`](../README.md) §6, вопрос 1). Везде ниже `<domain>` — плейсхолдер, например `triomio.com`.

## 1. Схема имён

| Имя | Куда | Когда |
| --- | --- | --- |
| `admin.<domain>` | Elastic IP сервера → Caddy → приложение | MVP |
| `<domain>`, `www.<domain>` | тот же Elastic IP → Caddy → контейнер сайта | вместе с сайтом-витриной |

## 2. До покупки домена

Сервер можно полностью настроить и задеплоить без домена:

- В security group нет inbound-правил, Caddy не запущен.
- Приложение слушает `127.0.0.1:8080` на хосте ([`../ops/01-docker-compose.md`](../ops/01-docker-compose.md) §2).
- Админка открывается через проброс порта Session Manager:

```bash
# один раз: плагин Session Manager для AWS CLI
brew install --cask session-manager-plugin

aws ssm start-session --profile triomio \
  --target <instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8080"],"localPortNumber":["8080"]}'
# админка: http://localhost:8080
```

Браузеры считают `localhost` безопасным контекстом, поэтому cookie с флагом `Secure` работают и по `http://localhost`.

Реальные данные (каталог, ключи площадок) на сервер не заливаем, пока не закрыт этап 4 (бэкапы и мониторинг). Домен для этого не нужен.

## 3. Покупка и DNS

Два варианта, выбирает владелец:

| Вариант | Плюсы | Минусы |
| --- | --- | --- |
| DNS у регистратора | бесплатно, ничего не переносить | DNS в другом кабинете |
| Route 53 hosted zone | всё в AWS, API, быстрое обновление | ≈ $0.50/мес за зону + смена NS у регистратора |

Записи для MVP:

| Имя | Тип | Значение | TTL |
| --- | --- | --- | --- |
| `admin` | A | Elastic IP | 300 |
| `@` | CAA | `0 issue "letsencrypt.org"` | 3600 |

AAAA-запись не создаём: сервер работает по IPv4.

## 4. Включение HTTPS

1. Проверить, что `dig +short admin.<domain>` возвращает Elastic IP.
2. Записать `admin-host` и `acme-email` в Parameter Store ([`03-s3-iam-ssm.md`](03-s3-iam-ssm.md) §6), пересобрать `.env`.
3. Добавить inbound 80 и 443 в security group ([`02-ec2-server.md`](02-ec2-server.md) §2).
4. Запустить Caddy: `docker compose up -d caddy`. Сертификат Let's Encrypt выпускается автоматически в течение минуты и дальше продлевается сам.
5. Проверить:
   - `curl -I http://admin.<domain>` → `308` на HTTPS;
   - `https://admin.<domain>` открывается без предупреждений;
   - `https://admin.<domain>/actuator/health` → `404`;
   - [SSL Labs](https://www.ssllabs.com/ssltest/) — оценка A или выше.

## 5. HSTS

Включаем постепенно, чтобы не запереть домен при ошибке в конфигурации:

1. Первая неделя: `max-age=300`.
2. Если всё стабильно: `max-age=31536000`.
3. `includeSubDomains` и preload — только когда сайт-витрина тоже будет на HTTPS.

## 6. Если сертификат не выпускается

| Симптом в логах Caddy | Причина |
| --- | --- |
| `NXDOMAIN` / `no valid A records` | DNS ещё не обновился или запись не на тот IP |
| `connection refused` / `timeout` на challenge | порт 80 закрыт в security group |
| `too many certificates` / rate limit | много неудачных попыток; Caddy сам переключится на запасной CA или подождёт; не перезапускать в цикле |
