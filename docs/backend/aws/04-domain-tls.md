# AWS: домен и HTTPS

Назад к плану: [`../README.md`](../README.md), шаг 3.6.

Домен ещё не куплен ([`../README.md`](../README.md) §6, вопрос 1). Везде ниже `<domain>` — плейсхолдер, например `triomio.com`.

## 1. Схема имён

| Имя | Куда | Когда |
| --- | --- | --- |
| `admin.<domain>` | Elastic IP сервера → nginx на хосте → приложение | MVP |
| `<domain>`, `www.<domain>` | тот же Elastic IP → nginx → контейнер сайта (отдельный `server {}` в nginx) | вместе с сайтом-витриной |

## 2. До покупки домена

Сервер можно полностью настроить и задеплоить без домена:

- В security group нет inbound-правил, сайт в nginx не включён.
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

Схема как в Lexio: nginx на хосте, certbot с плагином nginx.

1. Проверить, что `dig +short admin.<domain>` возвращает Elastic IP.
2. Записать `admin-host` и `acme-email` в Parameter Store ([`03-s3-iam-ssm.md`](03-s3-iam-ssm.md) §6), пересобрать `.env`.
3. Добавить inbound 80 и 443 в security group ([`02-ec2-server.md`](02-ec2-server.md) §2).
4. Включить сайт в nginx (конфиг — [`../ops/01-docker-compose.md`](../ops/01-docker-compose.md) §3):
   ```bash
   sed "s/__ADMIN_HOST__/admin.<domain>/g" /opt/triomio/nginx/admin.conf > /etc/nginx/sites-available/triomio-admin
   install -D -m 644 /opt/triomio/nginx/50x.html /var/www/triomio/50x.html
   ln -sf /etc/nginx/sites-available/triomio-admin /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```
5. Выпустить сертификат. certbot сам допишет в конфиг блок `listen 443 ssl` и редирект с HTTP:
   ```bash
   certbot --nginx -d admin.<domain> --non-interactive --agree-tos -m <acme-email> --redirect
   certbot renew --dry-run
   systemctl list-timers | grep certbot     # автопродление дважды в день
   ```
6. Проверить:
   - `curl -I http://admin.<domain>` → `301` на HTTPS;
   - `https://admin.<domain>` открывается без предупреждений;
   - `https://admin.<domain>/actuator/health` → `404`;
   - `docker compose stop app` → в браузере страница «Оновлюємо систему» с кодом 503; затем `docker compose start app`;
   - [SSL Labs](https://www.ssllabs.com/ssltest/) — оценка A или выше.

Сертификат и ключ лежат в `/etc/letsencrypt` на диске EC2. Их не бэкапим: при потере сервера certbot выпустит новые за минуту.

## 5. HSTS

Включаем постепенно, чтобы не запереть домен при ошибке в конфигурации:

1. Первая неделя: `max-age=300`.
2. Если всё стабильно: `max-age=31536000`.
3. `includeSubDomains` и preload — только когда сайт-витрина тоже будет на HTTPS.

## 6. Если сертификат не выпускается

Логи: `/var/log/letsencrypt/letsencrypt.log`, `journalctl -u certbot`.

| Симптом | Причина |
| --- | --- |
| `NXDOMAIN` / `DNS problem` | DNS ещё не обновился или запись не на тот IP |
| `Connection refused` / `Timeout during connect` | порт 80 закрыт в security group или nginx не запущен |
| `too many certificates` / `rateLimited` | слишком много попыток; подождать час и сначала проверить на `--dry-run` или `--staging`; не запускать certbot в цикле |
| Сертификат истёк, хотя таймер был | `certbot renew` падает: `certbot renew --dry-run` покажет причину; чаще всего порт 80 закрыли или сломали конфиг nginx (`nginx -t`) |
