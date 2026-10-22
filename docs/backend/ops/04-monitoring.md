# Мониторинг, логи и оповещения

Назад к плану: [`../README.md`](../README.md), шаги 4.4–4.6 и 9.6.

## 1. Логи

- Контейнеры пишут в CloudWatch Logs через драйвер `awslogs`, группа `/triomio/prod`, поток = имя контейнера ([`01-docker-compose.md`](01-docker-compose.md) §2).
- nginx на хосте пишет в `/var/log/nginx/`; эти файлы отправляет в ту же группу CloudWatch Agent (§2), потоки `nginx-access` и `nginx-error`. Локальная ротация — штатный `logrotate` Ubuntu.
- Группу создаём вручную до первого запуска: CloudWatch → Log groups → Create → `/triomio/prod`, retention 30 days.
- Приложение в профиле `prod` пишет JSON (structured logging Spring Boot): уровень, логгер, сообщение, `traceId`, `userId`, `marketplace`, `job`.
- Поиск: CloudWatch Logs Insights, например:
  ```
  fields @timestamp, level, message, marketplace
  | filter level = "ERROR"
  | sort @timestamp desc
  | limit 50
  ```

Что нельзя писать в логи — [`05-security.md`](05-security.md) §5.

## 2. Метрики хоста и логи nginx

CloudWatch Agent на EC2 ([`../aws/02-ec2-server.md`](../aws/02-ec2-server.md) §5) собирает только то, чего нет в стандартных метриках EC2, и логи nginx:

```json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/nginx/access.log", "log_group_name": "/triomio/prod", "log_stream_name": "nginx-access" },
          { "file_path": "/var/log/nginx/error.log", "log_group_name": "/triomio/prod", "log_stream_name": "nginx-error" }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "Triomio",
    "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
    "metrics_collected": {
      "mem": { "measurement": ["mem_used_percent"], "metrics_collection_interval": 60 },
      "disk": { "measurement": ["used_percent"], "resources": ["/"], "metrics_collection_interval": 300 }
    }
  }
}
```

Сохранить в `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json` и запустить:

```bash
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s
```

## 3. Алармы CloudWatch

Все шлют в SNS-топик `triomio-alerts` ([`../aws/03-s3-iam-ssm.md`](../aws/03-s3-iam-ssm.md) §7).

| Аларм | Метрика | Условие | Действие |
| --- | --- | --- | --- |
| `triomio-system-check` | `StatusCheckFailed_System` | ≥ 1 две минуты подряд | EC2 Recover + SNS |
| `triomio-instance-check` | `StatusCheckFailed_Instance` | ≥ 1 три минуты подряд | EC2 Reboot + SNS |
| `triomio-cpu` | `CPUUtilization` | > 80 % 15 минут | SNS |
| `triomio-cpu-credits` | `CPUCreditBalance` | < 20 | SNS — `t4g` исчерпывает кредиты при долгой нагрузке |
| `triomio-memory` | `Triomio/mem_used_percent` | > 90 % 10 минут | SNS |
| `triomio-disk` | `Triomio/disk_used_percent` | > 80 % | SNS |
| `triomio-app-errors` | metric filter по логам `level = "ERROR"` | > 20 за 5 минут | SNS |

Проверка аларма: `aws cloudwatch set-alarm-state --alarm-name triomio-disk --state-value ALARM --state-reason test`.

## 4. Бизнес-алерты (из приложения)

Это то, что важно для продаж и чего AWS не видит. Приложение публикует их в тот же SNS-топик, а также показывает в «Огляд» и «Інтеграції». Когда владелец выберет Telegram ([`../README.md`](../README.md) §6, вопрос 4), добавится второй канал.

| Событие | Порог | Почему важно |
| --- | --- | --- |
| Новый заказ | каждый | менеджер должен увидеть быстро |
| Заказ Epicentr не подтверждён | 30 минут до дедлайна | через 2 часа Epicentr отменяет заказ автоматически |
| Опрос заказов площадки не работает | нет успешного запуска 10 минут | заказы не приходят, остатки не резервируются |
| Строки outbox в `FAILED` | любая | цена или остаток на площадке расходятся с CRM |
| Сработал предохранитель | любой | запись на площадку поставлена на паузу ([`../08-marketplace-sync.md`](../08-marketplace-sync.md) §4) |
| Неизвестный статус заказа площадки | любой | маппинг статусов неполный |
| Сборка фида упала | любая | площадка читает устаревший фид |
| Ежедневная сверка нашла расхождения | > 0 | надо разобраться до того, как продадим то, чего нет |

Повторное оповещение по одной и той же проблеме — не чаще раза в 30 минут.

## 5. Внешняя проверка доступности

Бесплатный внешний монитор (Better Stack, UptimeRobot или аналог):

- `GET https://admin.<domain>/healthz` раз в минуту; ожидается `200`.
- Оповещение после двух неудачных проверок подряд.
- Отдельно — heartbeat бэкапов ([`03-backups-restore.md`](03-backups-restore.md) §3).

`/healthz` возвращает `200`, если приложение отвечает и база доступна, иначе `503`. Подробностей наружу не отдаёт.

Проверка (шаг 4.6): `docker compose stop app` → оповещение в течение 5 минут → `docker compose start app`.
