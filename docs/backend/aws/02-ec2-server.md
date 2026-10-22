# AWS: сервер EC2

Назад к плану: [`../README.md`](../README.md), этап 3. Сначала выполнить [`03-s3-iam-ssm.md`](03-s3-iam-ssm.md) §3 — роль для EC2 должна существовать до запуска инстанса.

## 1. Параметры

| Параметр | Значение | Почему |
| --- | --- | --- |
| Регион | `eu-central-1` | |
| AMI | Ubuntu Server 24.04 LTS, arm64 (официальный образ Canonical) | SSM Agent предустановлен; официальный apt-репозиторий Docker |
| Тип | `t4g.medium` (2 vCPU, 4 GiB) | Java + PostgreSQL + nginx с запасом. `t4g.small` (2 GiB) — только если бюджет критичен |
| Диск | gp3, 30 GiB, encrypted | База и логи маленькие; расширяется без остановки |
| Сеть | default VPC, публичная подсеть, auto-assign public IP — да | Без своих VPC и NAT: экономия и простота |
| Key pair | **без ключа** (Proceed without a key pair) | Вход только через Session Manager |
| IAM instance profile | `triomio-ec2-role` | [`03-s3-iam-ssm.md`](03-s3-iam-ssm.md) §3 |
| Metadata | IMDSv2 — Required, hop limit 2 | Hop limit 2 нужен контейнерам, которые ходят в метаданные (драйвер `awslogs` работает на хосте, приложение получает роль через SDK) |
| Termination protection | включить | |
| Теги | `Name=triomio-prod`, `project=triomio`, `env=prod` | |

## 2. Security group `triomio-web-sg`

| Направление | Порт | Источник | Зачем |
| --- | --- | --- | --- |
| Inbound | 80/tcp | `0.0.0.0/0`, `::/0` | выпуск сертификата Let's Encrypt и редирект на HTTPS |
| Inbound | 443/tcp | `0.0.0.0/0`, `::/0` | HTTPS |
| Inbound | 443/udp | `0.0.0.0/0`, `::/0` | HTTP/3 (необязательно) |
| Outbound | все | `0.0.0.0/0` | API площадок, S3, SSM, обновления ОС |

Порта 22 нет. Пока домен не куплен, inbound-правил нет вообще: админка доступна только через проброс порта SSM ([`04-domain-tls.md`](04-domain-tls.md) §2).

## 3. Elastic IP

EC2 → Elastic IPs → Allocate → Associate с инстансом. Этот адрес пойдёт в DNS-запись `admin.<domain>`. Публичный IPv4 платный (≈ $3.6/мес) независимо от того, Elastic он или нет.

## 4. Автовосстановление

- Simplified automatic recovery включён для `t4g` по умолчанию: при сбое железа AWS перезапустит инстанс на другом хосте с тем же диском и IP.
- Дополнительно — аларм `StatusCheckFailed_System` с действием Recover и `StatusCheckFailed_Instance` с действием Reboot ([`../ops/04-monitoring.md`](../ops/04-monitoring.md) §3).

## 5. Подготовка ОС

Вход: EC2 → инстанс → Connect → Session Manager. Дальше всё от `sudo -i`.

```bash
# Обновления и автоматические обновления безопасности
apt-get update && apt-get -y upgrade
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades
# перезагрузка при необходимости — ночью
cat >/etc/apt/apt.conf.d/51triomio <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF

# Время сервера — UTC; бизнес-часовой пояс применяет приложение
timedatectl set-timezone UTC

# Swap 2 GiB — страховка от OOM при пиках
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
```

### Docker

По официальной инструкции Docker для Ubuntu:

```bash
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Ротация логов для контейнеров с драйвером по умолчанию
cat >/etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
EOF
systemctl restart docker
```

### AWS CLI, доступ к ECR, CloudWatch Agent

```bash
# AWS CLI v2 (arm64)
apt-get install -y unzip
curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install

# docker pull из ECR по instance role, без docker login
apt-get install -y amazon-ecr-credential-helper
mkdir -p /root/.docker
echo '{ "credsStore": "ecr-login" }' > /root/.docker/config.json

# CloudWatch Agent (метрики памяти и диска)
curl -sSL https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb -o /tmp/cwagent.deb
dpkg -i /tmp/cwagent.deb
# конфигурация — ops/04-monitoring.md §2
```

### nginx и certbot

```bash
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
rm -f /etc/nginx/sites-enabled/default
```

Конфиг сайта и выпуск сертификата — после покупки домена ([`04-domain-tls.md`](04-domain-tls.md) §4). До этого nginx стоит, но наружу ничего не открыто: в security group нет inbound-правил.

### Каталог приложения

```bash
mkdir -p /opt/triomio/scripts /opt/triomio/nginx && chmod 700 /opt/triomio
# сюда кладутся: docker-compose.prod.yml, nginx/*, scripts/* из deploy/ репозитория
# .env создаётся скриптом render-env.sh из Parameter Store (ops/01-docker-compose.md §4)
```

Файлы из `deploy/` попадают на сервер при деплое ([`../ops/02-deploy.md`](../ops/02-deploy.md)); первый раз — вручную через `git clone` публичного репозитория во временную папку.

## 6. Проверка

- [ ] Session Manager открывает shell; `ss -tlnp` не показывает `sshd` на внешнем интерфейсе (или `sshd` отключён: `systemctl disable --now ssh`).
- [ ] `docker run --rm hello-world` работает.
- [ ] `aws sts get-caller-identity` на сервере возвращает роль `triomio-ec2-role`.
- [ ] `docker pull <registry>/triomio/crm:<tag>` работает без `docker login`.
- [ ] `free -h` показывает swap.
- [ ] С внешней машины `nc -vz <EIP> 22` и `nc -vz <EIP> 5432` — отказ.
