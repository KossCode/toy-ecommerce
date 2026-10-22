# Релизы, сборка и деплой

Назад к плану: [`../README.md`](../README.md), шаги 2.6 и 3.5.

Деплой в prod — только после явного «да» владельца ([`../../../.cursor/rules/workflow-and-secrets.mdc`](../../../.cursor/rules/workflow-and-secrets.mdc)). Технически это закреплено так: workflow запускается только вручную, а окружение `production` в GitHub требует подтверждения.

Цикл релиза повторяет Lexio: версия → заметка о релизе → тег → деплой → проверка → заметка помечена «задеплоено». Отличия от Lexio: образ собирается в GitHub Actions, а не на сервере, и доставляется через ECR и SSM, а не `rsync` по SSH ([`../02-tech-stack.md`](../02-tech-stack.md) §6).

## 1. Версии и заметки о релизах

- Версия — `vX.Y.Z` в `package.json` (корень репозитория). Это единый номер для админки и бэкенда: они в одном образе.
  - `Z` — исправления; `Y` — новая функциональность; `X` — пока `0`.
- На каждый релиз — заметка `docs/releases/vX.Y.Z.md` и строка в [`../../releases/README.md`](../../releases/README.md).
- Заметка короткая: что изменилось для пользователей CRM, есть ли миграции, затрагивает ли релиз запись в площадки, как проверить после деплоя. Статус в шапке: `готовится` → `задеплоено DD.MM.YYYY`.
- Git-тег `vX.Y.Z` ставится на коммит в `master` после мёржа PR с заметкой.
- Версия попадает в образ как `APP_VERSION`; её видно в `/actuator/info` и в футере админки. Так по одному взгляду понятно, что сейчас на проде.

Шаблон заметки:

```markdown
# vX.Y.Z — <коротко о главном>

Статус: готовится

## Что изменилось
- ...

## Миграции
- нет / `V12__...sql` (обратно совместима: да/нет)

## Площадки
- запись в площадки не затронута / что меняется и в каком режиме

## Проверка после деплоя
- ...
```

## 2. Образ

`deploy/Dockerfile`, контекст сборки — корень репозитория:

1. Стадия `web`: `node:22` → `npm ci` → `npm run build` (прод-сборка админки в `dist/`).
2. Стадия `build`: `eclipse-temurin:25-jdk` → копирует `backend/` и `dist/` в `backend/src/main/resources/static/` → `./mvnw -B -DskipTests package`. Тесты уже прошли в CI на PR.
3. Стадия `runtime`: `eclipse-temurin:25-jre` + `curl` для healthcheck → jar → пользователь без root (`USER 10001`) → `EXPOSE 8080`. Аргумент сборки `APP_VERSION` → переменная окружения.

Spring Boot отдаёт `index.html` с `Cache-Control: no-cache`, файлы из `assets/` (с хешем в имени) — с годовым кешем.

Демо для GitHub Pages собирается отдельно (`npm run build:pages`, workflow `deploy-pages.yml`) и этого образа не касается.

## 3. Workflow `deploy-backend.yml`

```yaml
name: Deploy backend
on:
  workflow_dispatch:
    inputs:
      version:
        description: "Версия релиза, например v0.3.1 (тег должен существовать)"
        required: true

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
        with:
          ref: ${{ inputs.version }}
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: eu-central-1
      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        run: |
          IMAGE=${{ steps.ecr.outputs.registry }}/triomio/crm:${{ inputs.version }}
          if docker manifest inspect "$IMAGE" > /dev/null 2>&1; then
            echo "Образ $IMAGE уже есть — пересборка не нужна (теги в ECR неизменяемые)"
          else
            docker build -f deploy/Dockerfile --build-arg APP_VERSION=${{ inputs.version }} -t "$IMAGE" .
            docker push "$IMAGE"
          fi
      - name: Deploy via SSM
        run: |
          CMD_ID=$(aws ssm send-command \
            --instance-ids "${{ vars.EC2_INSTANCE_ID }}" \
            --document-name AWS-RunShellScript \
            --parameters commands="/opt/triomio/scripts/deploy.sh ${{ inputs.version }}" \
            --query Command.CommandId --output text)
          aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "${{ vars.EC2_INSTANCE_ID }}" || true
          aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "${{ vars.EC2_INSTANCE_ID }}" \
            --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
          test "$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "${{ vars.EC2_INSTANCE_ID }}" --query Status --output text)" = Success
```

Версии actions фиксируются при создании файла. `aws ssm wait command-executed` ждёт около 100 секунд; если деплой дольше, шаг продолжает опрашивать `get-command-invocation` в цикле.

## 4. `deploy/scripts/deploy.sh <версия>` на сервере

Порядок шагов как в Lexio, плюс бэкап перед деплоем и автооткат:

1. Скачивает `docker-compose.prod.yml`, `nginx/50x.html` и `scripts/` для этой версии (`curl` raw-файлов публичного репозитория по тегу); `50x.html` копирует в `/var/www/triomio/`.
2. Копирует `.release/CURRENT_TAG` в `.release/PREVIOUS_TAG`.
3. `backup-db.sh predeploy`. Бэкап не удался — деплой останавливается.
4. `render-env.sh` → `.env` из Parameter Store; `APP_TAG` и `APP_VERSION` = версия.
5. `validate-env.sh` ([`01-docker-compose.md`](01-docker-compose.md) §4). Не хватает переменной — деплой останавливается до любых изменений.
6. `docker compose pull app && docker compose up -d --remove-orphans`. Сервер никогда не собирает образы.
7. Ждёт `http://127.0.0.1:8080/actuator/health/liveness` (до 3 минут), затем `.../readiness` (до 1 минуты).
8. `smoke.sh --internal` (§5).
9. Успех → пишет версию в `.release/CURRENT_TAG`.
10. Неуспех на шагах 6–8 → `rollback.sh` на `PREVIOUS_TAG`, вывод последних 80 строк лога приложения, выход с ошибкой. Workflow становится красным.

Простой при деплое — 30–60 секунд, пока стартует новый контейнер. Всё это время nginx показывает страницу «Оновлюємо систему». Деплоим не в часы пик и не тогда, когда у заказов Epicentr горит срок подтверждения.

## 5. `smoke.sh`

Проверки без учётки пользователя, чтобы на сервере не хранить пароль для smoke:

| Проверка | Ожидание |
| --- | --- |
| `GET /healthz` | `200` |
| `GET /actuator/info` | версия = только что задеплоенная |
| `GET /api/products` без сессии | `401` в формате `problem+json`, а не `500` |
| `GET /` | `200`, HTML админки |
| `GET /feeds/wrong-token/prom.xml` | `404` |
| `GET /actuator/health` через nginx (`https://admin.<domain>`) | `404` — закрыт снаружи (после появления домена) |

`--internal` ходит на `127.0.0.1:8080`; без флага — на `https://admin.<domain>` через nginx. После деплоя человек всё равно открывает админку и проверяет пункт «Проверка после деплоя» из заметки релиза.

## 6. Миграции и откат

- Flyway применяет миграции при старте приложения. В PostgreSQL DDL транзакционный: упавшая миграция откатывается целиком, а старая версия приложения продолжает работать со старой схемой.
- Правило миграций — [`../../../.cursor/rules/safe-db-migrations.mdc`](../../../.cursor/rules/safe-db-migrations.mdc): только добавляющие изменения, expand/contract. Поэтому предыдущий образ работает с новой схемой, и откат приложения безопасен.
- `rollback.sh` откатывает только образ. Миграции не откатываются — как в Lexio.
- Если миграция всё-таки несовместима (удаление колонки, переименование), откат — только восстановлением из `predeploy`-дампа ([`03-backups-restore.md`](03-backups-restore.md) §4). Такие миграции заранее согласуются и деплоятся отдельным релизом.

## 7. Ручной откат

```bash
# Session Manager на сервер
sudo -i
cd /opt/triomio
cat .release/CURRENT_TAG .release/PREVIOUS_TAG
./scripts/rollback.sh                 # на PREVIOUS_TAG
./scripts/rollback.sh v0.3.0          # или на конкретную версию
```

`rollback.sh` = `APP_TAG=<версия>` → `docker compose up -d app` → liveness → readiness → `smoke.sh --internal` → `CURRENT_TAG`. В заметку откаченного релиза дописываем «откатан DD.MM.YYYY, причина».

Цель — меньше 5 минут от решения до работающей предыдущей версии (критерий шага 3.5).

## 8. Ручной деплой без GitHub Actions

Если Actions недоступен: собрать образ локально под `linux/arm64` с `--build-arg APP_VERSION=<версия>`, отправить в ECR через `aws ecr get-login-password` под SSO-профилем, затем на сервере `deploy.sh <версия>`. Шаги и подтверждение владельца — те же.

## 9. Чек-лист релиза

- [ ] Версия поднята в `package.json`, заметка `docs/releases/vX.Y.Z.md` написана, строка в индексе добавлена.
- [ ] PR смёржен, CI зелёный, тег `vX.Y.Z` поставлен и запушен.
- [ ] Владелец сказал «да» на этот деплой.
- [ ] Если есть миграция — она обратно совместима, или владелец согласовал окно.
- [ ] Нет заказов Epicentr с дедлайном в ближайшие 30 минут.
- [ ] После деплоя: версия в футере совпадает, «Огляд» открывается, последний опрос заказов свежий, в outbox нет новых `FAILED`.
- [ ] Заметка помечена «задеплоено DD.MM.YYYY» отдельным коммитом.
