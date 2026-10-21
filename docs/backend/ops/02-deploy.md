# Сборка и деплой

Назад к плану: [`../README.md`](../README.md), шаги 2.6 и 3.5.

Деплой в prod — только после явного «да» владельца ([`../../../.cursor/rules/workflow-and-secrets.mdc`](../../../.cursor/rules/workflow-and-secrets.mdc)). Технически это закреплено так: workflow запускается только вручную, а окружение `production` в GitHub требует подтверждения.

## 1. Образ

`deploy/Dockerfile`, контекст сборки — корень репозитория:

1. Стадия `web`: `node:22` → `npm ci` → `npm run build` (прод-сборка админки в `dist/`).
2. Стадия `build`: `eclipse-temurin:25-jdk` → копирует `backend/` и `dist/` в `backend/src/main/resources/static/` → `./mvnw -B -DskipTests package`. Тесты уже прошли в CI на PR.
3. Стадия `runtime`: `eclipse-temurin:25-jre` + `curl` для healthcheck → jar → пользователь без root (`USER 10001`) → `EXPOSE 8080`.

Spring Boot отдаёт `index.html` с `Cache-Control: no-cache`, файлы из `assets/` (с хешем в имени) — с годовым кешем.

Демо для GitHub Pages собирается отдельно (`npm run build:pages`, workflow `deploy-pages.yml`) и этого образа не касается.

## 2. Workflow `deploy-backend.yml`

```yaml
name: Deploy backend
on:
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency:
  group: deploy-backend
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-24.04-arm         # нативная сборка arm64
    environment: production           # требует подтверждения
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: eu-central-1
      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        run: |
          IMAGE=${{ steps.ecr.outputs.registry }}/triomio/crm:${{ github.sha }}
          docker build -f deploy/Dockerfile -t "$IMAGE" .
          docker push "$IMAGE"
      - name: Deploy via SSM
        run: |
          CMD_ID=$(aws ssm send-command \
            --instance-ids "${{ vars.EC2_INSTANCE_ID }}" \
            --document-name AWS-RunShellScript \
            --parameters commands="/opt/triomio/scripts/deploy.sh ${{ github.sha }}" \
            --query Command.CommandId --output text)
          aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "${{ vars.EC2_INSTANCE_ID }}" || true
          aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "${{ vars.EC2_INSTANCE_ID }}" \
            --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
          test "$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "${{ vars.EC2_INSTANCE_ID }}" --query Status --output text)" = Success
```

Деплоится тот коммит, с которого запущен workflow (обычно `master` после мёржа). Версии actions фиксируются при создании файла.

## 3. `deploy/scripts/deploy.sh` на сервере

Что делает скрипт по шагам:

1. Обновляет `docker-compose.prod.yml`, `Caddyfile` и `scripts/` из репозитория на нужном коммите (`curl` raw-файлов публичного репозитория по `sha`).
2. Запоминает текущий тег из `/opt/triomio/current_tag` как предыдущий.
3. Делает внеочередной бэкап: `backup-db.sh predeploy`. Если бэкап не удался — деплой останавливается.
4. `render-env.sh`, затем `APP_TAG=<sha>` в `.env`.
5. `docker compose pull app && docker compose up -d app`.
6. Ждёт `healthy` до 180 секунд.
7. Успех → пишет `<sha>` в `current_tag`, запускает `smoke.sh` (`/healthz`, вход тестовым запросом без учётки → `401`, а не `500`).
8. Неуспех → `APP_TAG=<предыдущий>`, `docker compose up -d app`, выход с ошибкой. Workflow становится красным.

Простой при деплое — 30–60 секунд, пока стартует новый контейнер. Деплоим не в часы пик и не тогда, когда у заказов Epicentr горит срок подтверждения.

## 4. Миграции и откат

- Flyway применяет миграции при старте приложения. В PostgreSQL DDL транзакционный: упавшая миграция откатывается целиком, а старая версия приложения продолжает работать со старой схемой.
- Миграции пишутся в стиле expand/contract ([`../04-data-model.md`](../04-data-model.md) §4). Поэтому предыдущий образ работает с новой схемой, и откат приложения безопасен.
- Если миграция всё-таки несовместима (удаление колонки, переименование), откат — только восстановлением из `predeploy`-дампа ([`03-backups-restore.md`](03-backups-restore.md) §4). Такие миграции заранее согласуются и деплоятся отдельно.

## 5. Ручной откат

```bash
# Session Manager на сервер
sudo -i
cd /opt/triomio
cat current_tag                              # текущий
aws ecr describe-images --repository-name triomio/crm \
  --query 'sort_by(imageDetails,&imagePushedAt)[-5:].imageTags' --output text
./scripts/deploy.sh <предыдущий-sha>
```

Цель — меньше 5 минут от решения до работающей предыдущей версии (критерий шага 3.5).

## 6. Ручной деплой без GitHub Actions

Если Actions недоступен: собрать образ локально под `linux/arm64`, отправить в ECR через `aws ecr get-login-password` под SSO-профилем, затем запустить на сервере `deploy.sh <tag>`. Шаги те же, подтверждение владельца — то же.

## 7. Чек-лист деплоя

- [ ] Владелец сказал «да» на этот деплой.
- [ ] PR смёржен, CI зелёный.
- [ ] Если есть миграция — она обратно совместима, или владелец согласовал окно.
- [ ] Нет заказов Epicentr с дедлайном в ближайшие 30 минут.
- [ ] После деплоя: «Огляд» открывается, последний опрос заказов свежий, в outbox нет новых `FAILED`.
