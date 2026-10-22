# AWS: S3, ECR, IAM, Parameter Store

Назад к плану: [`../README.md`](../README.md), этап 3.

В примерах ниже `<ACCOUNT_ID>`, `<media-bucket>`, `<backups-bucket>` — плейсхолдеры. Реальные значения в репозиторий не пишем.

## 1. Бакет фото `media`

Имя: `triomio-media-prod-<случайный суффикс>` (имена бакетов глобальные). Регион `eu-central-1`.

| Настройка | Значение |
| --- | --- |
| Object Ownership | Bucket owner enforced (ACL выключены) |
| Block Public Access | включены оба пункта про ACL; **выключены** оба пункта про bucket policies |
| Versioning | Enabled |
| Default encryption | SSE-S3 |
| Lifecycle | `noncurrent-30d`: удалять неактуальные версии через 30 дней |

Bucket policy — публичное чтение только `products/`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadProductPhotos",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<media-bucket>/products/*"
    }
  ]
}
```

Проверка: объект в `products/` открывается в браузере по URL; объект в любом другом префиксе даёт `AccessDenied`.

## 2. Бакет бэкапов `backups`

Имя: `triomio-backups-prod-<суффикс>`.

| Настройка | Значение |
| --- | --- |
| Block Public Access | всё включено |
| Versioning | Enabled |
| Default encryption | SSE-S3 |

Lifecycle-правила ([`../ops/03-backups-restore.md`](../ops/03-backups-restore.md) §2):

| Правило | Префикс | Действие |
| --- | --- | --- |
| `hourly` | `hourly/` | удалить через 2 дня |
| `daily` | `daily/` | удалить через 35 дней |
| `monthly` | `monthly/` | удалить через 365 дней |
| `predeploy` | `predeploy/` | удалить через 14 дней |
| `noncurrent` | весь бакет | неактуальные версии — удалить через 7 дней |

Роль сервера может класть и читать объекты, но не удалять. Даже если сервер скомпрометируют, стереть бэкапы с него не получится; удаляет только lifecycle.

## 3. Роль для EC2 `triomio-ec2-role`

IAM → Roles → Create role → Trusted entity: AWS service → EC2.

Готовые политики:

- `AmazonSSMManagedInstanceCore` — Session Manager и Run Command.
- `CloudWatchAgentServerPolicy` — метрики агента и логи драйвера `awslogs`.
- `AmazonEC2ContainerRegistryReadOnly` — `docker pull` из ECR.

Своя inline-политика `triomio-app`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MediaReadWrite",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<media-bucket>/products/*"
    },
    {
      "Sid": "BackupsPutAndRead",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::<backups-bucket>/*"
    },
    {
      "Sid": "BackupsList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<backups-bucket>"
    },
    {
      "Sid": "ReadProdParameters",
      "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
      "Resource": "arn:aws:ssm:eu-central-1:<ACCOUNT_ID>:parameter/triomio/prod/*"
    },
    {
      "Sid": "PublishAlerts",
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:eu-central-1:<ACCOUNT_ID>:triomio-alerts"
    }
  ]
}
```

Для SecureString, зашифрованных ключом по умолчанию `aws/ssm`, отдельное право `kms:Decrypt` не нужно.

## 4. ECR

- Repository: `triomio/crm`, private.
- Tag immutability: Immutable — тег версии `vX.Y.Z` нельзя перезаписать, откат всегда на тот же образ.
- Scan on push: Basic.
- Lifecycle policy: хранить последние 20 образов.

## 5. Доступ GitHub Actions через OIDC

Без access keys в GitHub Secrets.

1. IAM → Identity providers → Add provider → OpenID Connect:
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. Роль `triomio-github-deploy`, trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:KossCode/toy-ecommerce:environment:production"
        }
      }
    }
  ]
}
```

Роль может взять только job в окружении `production` этого репозитория. Окружение `production` в GitHub настраивается с обязательным подтверждением (required reviewers).

3. Права роли:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "EcrAuth", "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    {
      "Sid": "EcrPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage"
      ],
      "Resource": "arn:aws:ecr:eu-central-1:<ACCOUNT_ID>:repository/triomio/crm"
    },
    {
      "Sid": "DeployViaRunCommand",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:eu-central-1::document/AWS-RunShellScript",
        "arn:aws:ec2:eu-central-1:<ACCOUNT_ID>:instance/*"
      ],
      "Condition": { "StringEquals": { "ssm:resourceTag/project": "triomio" } }
    },
    {
      "Sid": "ReadCommandResult",
      "Effect": "Allow",
      "Action": ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"],
      "Resource": "*"
    }
  ]
}
```

ARN роли и ID инстанса кладём в GitHub → Settings → Environments → `production` → Variables (`AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`), а не в файлы репозитория.

## 6. Parameter Store

Все параметры — в `eu-central-1`, тип SecureString для секретов, ключ `aws/ssm`.

| Параметр | Тип | Что |
| --- | --- | --- |
| `/triomio/prod/db/password` | SecureString | пароль PostgreSQL, 32+ случайных символа |
| `/triomio/prod/crypto/master-key` | SecureString | 32 байта в base64 для шифрования ключей площадок ([`../08-marketplace-sync.md`](../08-marketplace-sync.md) §5) |
| `/triomio/prod/feeds/token` | SecureString | секрет в URL фидов |
| `/triomio/prod/backup/heartbeat-url` | SecureString | URL пинга внешнего мониторинга бэкапов |
| `/triomio/prod/app/admin-host` | String | `admin.<domain>` |
| `/triomio/prod/app/acme-email` | String | почта для Let's Encrypt |
| `/triomio/prod/app/integrations-max-mode` | String | потолок режима записи, по умолчанию `DRY_RUN` |
| `/triomio/prod/s3/media-bucket` | String | имя бакета фото |
| `/triomio/prod/s3/backups-bucket` | String | имя бакета бэкапов |

Сгенерировать случайные значения:

```bash
openssl rand -base64 32   # master-key
openssl rand -hex 24      # пароль БД, токен фидов
```

Ключи площадок здесь **не хранятся** — их вводит владелец в админке.

## 7. SNS для алармов

Topic `triomio-alerts` (Standard) → подписка Email на почту владельца и разработчика → подтвердить письма. Используется алармами CloudWatch и бизнес-алертами приложения ([`../ops/04-monitoring.md`](../ops/04-monitoring.md)).
