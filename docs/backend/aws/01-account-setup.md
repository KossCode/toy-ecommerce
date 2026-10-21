# AWS: создание аккаунта и базовая безопасность

Назад к плану: [`../README.md`](../README.md), этап 1.

Все действия — в консоли AWS вручную. Идентификаторы аккаунта, ARN, email и пароли в репозиторий не записываем: он публичный. Их место — менеджер паролей.

## 1. Перед регистрацией

- [ ] Решено, чей аккаунт и чья карта ([`../README.md`](../README.md) §6, вопрос 2). Правильнее всего — аккаунт клиента: юридически данные и счета его, разработчик получает доступ через Identity Center.
- [ ] Заведён общий почтовый ящик для root (например, `aws@<domain>` или отдельный ящик владельца). Не личная почта разработчика: при смене подрядчика доступ к root не должен уйти вместе с ним.
- [ ] Есть менеджер паролей с общим хранилищем, где будут root-пароль, MFA-резерв и коды восстановления.

## 2. Регистрация

1. https://aws.amazon.com → Create an AWS Account.
2. Тип аккаунта — Business, если аккаунт на компанию/ФОП клиента.
3. План: с июля 2025 года новый аккаунт выбирает Free plan (стартовые кредиты, ограниченный срок, не все сервисы) или Paid plan. Условия меняются — читать на странице регистрации. Всё, что нам нужно (EC2, S3, ECR, SSM, CloudWatch), работает на обоих; на Free plan по окончании срока аккаунт нужно перевести на Paid, иначе ресурсы остановятся.
4. Support plan — Basic (бесплатный).

## 3. Защита root

- [ ] IAM → Security credentials (под root) → Assign MFA: passkey или аппаратный ключ. Второй фактор — резервный (второй ключ или TOTP в менеджере паролей).
- [ ] Убедиться, что у root нет access keys. Не создавать.
- [ ] Account → Alternate contacts: заполнить Billing, Operations, Security (почта владельца и разработчика).
- [ ] Account → IAM user and role access to Billing information → Activate.

После этого под root заходим только для задач, которые требуют root (смена плана, закрытие аккаунта).

## 4. Ежедневный доступ: IAM Identity Center

Identity Center даёт вход в консоль и CLI с временными ключами, без долгоживущих access keys.

1. Регион консоли — `eu-central-1` (Frankfurt).
2. IAM Identity Center → Enable → «Enable with AWS Organizations». Аккаунт станет management-аккаунтом организации из одного аккаунта; это бесплатно.
3. Settings → Authentication → MFA: «Every time they sign in», тип — security keys / authenticator apps.
4. Users → создать пользователя для разработчика и для владельца.
5. Permission sets → `AdministratorAccess` (готовый) с длительностью сессии 8 часов.
6. AWS accounts → выбрать аккаунт → Assign users → оба пользователя → `AdministratorAccess`.
7. Сохранить AWS access portal URL в менеджер паролей.

Локальная настройка CLI:

```bash
aws configure sso
# SSO start URL: <access portal URL>
# SSO region: eu-central-1
# профиль: triomio
aws sso login --profile triomio
aws sts get-caller-identity --profile triomio
```

Запасной вариант без Identity Center: IAM-пользователь с паролем, MFA и группой `Admins`, **без** access keys; CLI — через CloudShell в консоли. Использовать, только если Identity Center недоступен.

## 5. Защита от неожиданных счетов

- [ ] Billing → Budgets → Create budget → Monthly cost budget. Сумма — ориентир из [`../README.md`](../README.md) §3 с запасом (например, $60). Оповещения на 50 %, 80 %, 100 % фактических и 100 % прогнозных трат на почту владельца и разработчика.
- [ ] Ещё один бюджет — Zero spend budget, пока аккаунт на кредитах: письмо при первом реальном списании.
- [ ] Billing → Cost Anomaly Detection → monitor по сервисам, оповещение на почту.
- [ ] Billing preferences → Free Tier usage alerts → включить.

## 6. Настройки региона и аккаунта

- [ ] EC2 → Settings (в `eu-central-1`) → EBS encryption → Always encrypt new EBS volumes.
- [ ] S3 → Block Public Access settings for this account — оставить включённым всё, кроме двух пунктов про bucket policies, иначе не получится открыть `products/` в бакете фото ([`03-s3-iam-ssm.md`](03-s3-iam-ssm.md) §1). Публичность бакета `backups` всё равно закрыта на уровне самого бакета.
- [ ] CloudTrail: история событий за 90 дней включена по умолчанию и бесплатна. Отдельный trail с хранением в S3 на старте не создаём; вернуться, если понадобится аудит дольше 90 дней.
- [ ] IAM Access Analyzer → создать анализатор на аккаунт (бесплатный уровень) — покажет, если что-то стало доступно извне.

## 7. Соглашения

| Что | Значение |
| --- | --- |
| Регион | `eu-central-1` для всего, кроме глобальных сервисов (IAM, Billing) |
| Теги | `project=triomio`, `env=prod` на каждом ресурсе |
| Имена | префикс `triomio-` (`triomio-web-sg`, `triomio-ec2-role`) |

## 8. Критерии приёмки этапа

Совпадают с этапом 1 в [`../README.md`](../README.md) §5.
