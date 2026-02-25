# Guia Completo de Migração — Lovable Cloud → Supabase Self-Hosted

> **Objetivo:** Migrar toda a infraestrutura backend (banco de dados, Edge Functions, storage, auth) para uma instância Supabase self-hosted em VPS própria, eliminando custos por invocação de Edge Functions.
>
> **Estimativa de economia:** De ~$500-1.000/mês (Cloud) para ~$40-65/mês (VPS fixa).

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Exportação do Banco de Dados](#2-exportação-do-banco-de-dados)
3. [Instalação do Supabase Self-Hosted](#3-instalação-do-supabase-self-hosted)
4. [Restauração do Banco de Dados](#4-restauração-do-banco-de-dados)
5. [Migração dos 27 Secrets](#5-migração-dos-27-secrets)
6. [Deploy das 70 Edge Functions](#6-deploy-das-70-edge-functions)
7. [Configuração de Cron Jobs](#7-configuração-de-cron-jobs)
8. [Atualização do Frontend](#8-atualização-do-frontend)
9. [Webhooks — Atualizar URLs de Callback](#9-webhooks--atualizar-urls-de-callback)
10. [Storage — Migrar Buckets](#10-storage--migrar-buckets)
11. [Auth — Migrar Configurações](#11-auth--migrar-configurações)
12. [Verificação Pós-Migração](#12-verificação-pós-migração)
13. [Rollback — Como Voltar ao Cloud](#13-rollback--como-voltar-ao-cloud)

---

## 1. Pré-requisitos

### Hardware mínimo (VPS)

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| RAM | 8 GB | 16 GB |
| vCPU | 4 cores | 8 cores |
| Disco | 80 GB SSD | 160 GB NVMe |
| Banda | 1 Gbps | 1 Gbps |
| SO | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

### Software necessário

```bash
# Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Git
sudo apt install -y git

# Supabase CLI
curl -sL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar xz
sudo mv supabase /usr/local/bin/

# psql client (para pg_dump/pg_restore)
sudo apt install -y postgresql-client-16

# Certbot (SSL)
sudo apt install -y certbot python3-certbot-nginx

# Node.js 20+ (para build do frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Domínio e DNS

Aponte os seguintes registros DNS para o IP da VPS:

| Registro | Tipo | Valor |
|----------|------|-------|
| `miauchat.com.br` | A | `<IP_VPS>` |
| `*.miauchat.com.br` | A | `<IP_VPS>` |
| `api.miauchat.com.br` | A | `<IP_VPS>` |
| `db.miauchat.com.br` | A | `<IP_VPS>` (se quiser acesso externo ao DB) |

---

## 2. Exportação do Banco de Dados

### 2.1. Obter credenciais do Cloud

No Lovable Cloud, vá em **Settings → Cloud → Database** e copie:
- **Host:** `db.jiragtersejnarxruqyd.supabase.co`
- **Porta:** `5432`
- **Database:** `postgres`
- **User:** `postgres`
- **Password:** (copie do dashboard)

### 2.2. Exportar schema (DDL)

```bash
# Schema completo (tabelas, views, functions, triggers, RLS policies, indexes)
pg_dump \
  --host=db.jiragtersejnarxruqyd.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file=schema_public.sql

# Schema de storage
pg_dump \
  --host=db.jiragtersejnarxruqyd.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=storage \
  --schema-only \
  --no-owner \
  --file=schema_storage.sql
```

### 2.3. Exportar dados

```bash
# Dados completos (todas as tabelas public)
pg_dump \
  --host=db.jiragtersejnarxruqyd.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=public \
  --data-only \
  --no-owner \
  --no-privileges \
  --file=data_public.sql

# Ou formato custom (mais rápido para restore)
pg_dump \
  --host=db.jiragtersejnarxruqyd.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=public \
  --format=custom \
  --no-owner \
  --file=backup_public.dump
```

### 2.4. Tabelas principais (90+)

As tabelas são restauradas automaticamente pelo `pg_dump/pg_restore`. Tabelas críticas com dependências FK (ordem importa no restore):

1. `law_firms` — raiz de todo o multi-tenant
2. `companies` → FK para `law_firms`, `plans`
3. `plans` — planos de assinatura
4. `profiles` → FK para `law_firms`
5. `user_roles` → FK para `profiles`
6. `departments` → FK para `law_firms`
7. `whatsapp_instances` → FK para `law_firms`
8. `clients` → FK para `law_firms`, `whatsapp_instances`
9. `conversations` → FK para `law_firms`, `clients`, `whatsapp_instances`
10. `messages` → FK para `conversations`
11. `automations` → FK para `law_firms`
12. `knowledge_items` → FK para `law_firms`
13. `custom_statuses` → FK para `law_firms`
14. `tags` → FK para `law_firms`
15. `tasks` → FK para `law_firms`
16. `admin_user_roles` — admins globais
17. `admin_profiles` — perfis de admin
18. `ai_processing_queue` — fila de processamento IA
19. `agenda_pro_*` — todas as tabelas do Agenda Pro (15+ tabelas)
20. `evolution_api_connections` — conexões com Evolution API
21. `meta_connections` — conexões Meta/Instagram
22. `scheduled_follow_ups` — follow-ups agendados
23. `status_follow_ups` — regras de follow-up
24. `notification_preferences` — preferências de notificação
25. `dashboard_daily_snapshots` — snapshots do dashboard

> **Nota:** O `pg_dump` com formato `custom` e `pg_restore` respeitam automaticamente a ordem de FKs.

---

## 3. Instalação do Supabase Self-Hosted

### 3.1. Clonar o repositório

```bash
cd /opt
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

### 3.2. Configurar `.env`

Edite `/opt/supabase/docker/.env`:

```bash
############
# Secrets - GERE NOVOS VALORES PARA CADA UM!
############

# Gerar JWT secret (32+ chars)
JWT_SECRET=seu-jwt-secret-super-secreto-com-pelo-menos-32-chars

# Gerar anon key (use https://supabase.com/docs/guides/self-hosting#api-keys)
ANON_KEY=eyJ...  # Gere via jwt.io com role=anon

# Gerar service role key
SERVICE_ROLE_KEY=eyJ...  # Gere via jwt.io com role=service_role

# Postgres
POSTGRES_PASSWORD=sua-senha-postgres-forte
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# Dashboard
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=sua-senha-dashboard

# API
SITE_URL=https://miauchat.com.br
API_EXTERNAL_URL=https://api.miauchat.com.br

# SMTP (Resend)
SMTP_ADMIN_EMAIL=noreply@miauchat.com.br
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_... # Sua chave Resend
SMTP_SENDER_NAME=MiauChat

# Studio
STUDIO_PORT=3000
```

### 3.3. Gerar JWT Keys

```bash
# Instale o jwt-cli ou use jwt.io
# Payload para ANON_KEY:
{
  "iss": "supabase",
  "ref": "local",
  "role": "anon",
  "iat": 1700000000,
  "exp": 2000000000
}

# Payload para SERVICE_ROLE_KEY:
{
  "iss": "supabase",
  "ref": "local",
  "role": "service_role",
  "iat": 1700000000,
  "exp": 2000000000
}

# Assine ambos com o JWT_SECRET usando HS256
```

### 3.4. Subir os containers

```bash
cd /opt/supabase/docker
docker compose pull
docker compose up -d

# Verificar se tudo subiu
docker compose ps
```

Serviços que devem estar rodando:
- `supabase-db` (PostgreSQL)
- `supabase-auth` (GoTrue)
- `supabase-rest` (PostgREST)
- `supabase-realtime`
- `supabase-storage`
- `supabase-edge-functions` (Deno)
- `supabase-studio` (Dashboard)
- `supabase-kong` (API Gateway)

### 3.5. Configurar Nginx como reverse proxy

```nginx
# /etc/nginx/sites-available/api.miauchat.com.br
server {
    listen 443 ssl http2;
    server_name api.miauchat.com.br;

    ssl_certificate /etc/letsencrypt/live/miauchat.com.br-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/miauchat.com.br-0001/privkey.pem;

    # Kong API Gateway (porta padrão 8000)
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api.miauchat.com.br /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.miauchat.com.br
sudo systemctl reload nginx
```

---

## 4. Restauração do Banco de Dados

### 4.1. Restaurar schema

```bash
# Conectar ao banco local
psql -h localhost -p 5432 -U postgres -d postgres

# Ou via docker
docker exec -i supabase-db psql -U postgres -d postgres < schema_public.sql
```

### 4.2. Restaurar dados

```bash
# Se usou formato SQL
docker exec -i supabase-db psql -U postgres -d postgres < data_public.sql

# Se usou formato custom
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --no-owner \
  --no-privileges \
  --data-only \
  backup_public.dump
```

### 4.3. Habilitar extensões necessárias

```sql
-- Conectar ao banco e habilitar
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pgjwt";
```

### 4.4. Verificar integridade

```sql
-- Contar registros nas tabelas críticas
SELECT 'law_firms' as tabela, COUNT(*) FROM law_firms
UNION ALL SELECT 'companies', COUNT(*) FROM companies
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL SELECT 'messages', COUNT(*) FROM messages
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'whatsapp_instances', COUNT(*) FROM whatsapp_instances
UNION ALL SELECT 'automations', COUNT(*) FROM automations;
```

---

## 5. Migração dos 27 Secrets

Cada secret precisa ser configurado no Supabase self-hosted. Execute no servidor:

```bash
cd /var/www/miauchat  # diretório do projeto
```

### Lista completa de secrets

| # | Secret | Onde obter | Usado por |
|---|--------|-----------|-----------|
| 1 | `ADMIN_NOTIFICATION_EMAIL` | Seu email de admin | `send-admin-notification`, `check-instance-alerts` |
| 2 | `ASAAS_API_KEY` | [Asaas Dashboard](https://www.asaas.com/) → Integrações → API | `generate-payment-link`, `verify-payment` |
| 3 | `ASAAS_WEBHOOK_TOKEN` | Definido por você ao configurar webhook no Asaas | `stripe-webhook` (verificação) |
| 4 | `BOOKING_URL` | URL pública do agendamento (ex: `https://miauchat.com.br/agendar`) | `agenda-pro-confirmation` |
| 5 | `CRON_SECRET` | Gere um token aleatório: `openssl rand -hex 32` | Todas as funções cron (autenticação) |
| 6 | `ELEVENLABS_API_KEY` | [ElevenLabs](https://elevenlabs.io/) → Profile → API Keys | `elevenlabs-tts` |
| 7 | `EVOLUTION_BASE_URL` | URL da sua instância Evolution API (ex: `https://evo.miauchat.com.br`) | `evolution-api`, `evolution-webhook`, `evolution-health`, `auto-reconnect-instances`, `sync-evolution-instances` |
| 8 | `EVOLUTION_GLOBAL_API_KEY` | Evolution API → Settings → Global API Key | Mesmas funções acima |
| 9 | `EVOLUTION_WEBHOOK_TOKEN` | Definido por você na config da Evolution | `evolution-webhook` (verificação) |
| 10 | `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/) → Credentials → OAuth 2.0 | Auth (login Google) |
| 11 | `GOOGLE_CLIENT_SECRET` | Mesmo local acima | Auth (login Google) |
| 12 | `META_APP_ID` | [Meta Developers](https://developers.facebook.com/) → App Dashboard | `meta-webhook`, `meta-oauth-callback`, `meta-api` |
| 13 | `META_APP_SECRET` | Mesmo local → Settings → Basic | Mesmas funções acima |
| 14 | `META_INSTAGRAM_APP_ID` | Meta Developers → App separado para Instagram | Instagram integration |
| 15 | `META_INSTAGRAM_APP_SECRET` | Mesmo local | Instagram integration |
| 16 | `META_WEBHOOK_VERIFY_TOKEN` | Definido por você ao configurar webhook no Meta | `meta-webhook` |
| 17 | `N8N_API_URL` | URL da sua instância n8n (ex: `https://n8n.miauchat.com.br`) | `create-n8n-workflow`, `delete-n8n-workflow`, `list-n8n-workflows`, `n8n-workflow-manager`, `sync-n8n-prompt` |
| 18 | `N8N_API_KEY` | n8n → Settings → API → Create API Key | Mesmas funções acima |
| 19 | `N8N_INTERNAL_TOKEN` | Token interno para comunicação n8n ↔ Edge Functions | `test-n8n-webhook` |
| 20 | `N8N_TEMPLATE_WORKFLOW_ID` | ID do workflow template no n8n | `create-n8n-workflow` |
| 21 | `N8N_WEBHOOK_URL` | URL do webhook no n8n | `retry-failed-workflows` |
| 22 | `OPENAI_API_KEY` | [OpenAI](https://platform.openai.com/api-keys) → API Keys | `ai-chat`, `ai-classify`, `generate-summary`, `extract-client-facts`, `transcribe-audio` |
| 23 | `RESEND_API_KEY` | [Resend](https://resend.com/) → API Keys | `send-auth-email`, `send-admin-notification`, `invite-team-member`, `resend-initial-access`, `custom-password-reset`, `test-email`, `send-billing-reminder`, `process-trial-reminders` |
| 24 | `STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) | `create-checkout-session`, `customer-portal`, `admin-create-stripe-subscription`, `update-stripe-subscription`, `sync-stripe-subscriptions`, `list-stripe-invoices`, `get-payment-metrics`, `get-company-billing-summary` |
| 25 | `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Signing secret | `stripe-webhook` |
| 26 | `TOKEN_ENCRYPTION_KEY` | Gere: `openssl rand -hex 32` | `_shared/encryption.ts` (encriptar tokens Meta/OAuth) |
| 27 | `LOVABLE_API_KEY` | ⚠️ **NÃO MIGRAR** — exclusivo do Lovable Cloud | `ai-chat` (via Lovable AI proxy) |

### Configurar secrets no self-hosted

```bash
# Opção 1: Via supabase CLI
supabase secrets set OPENAI_API_KEY=sk-xxx
supabase secrets set RESEND_API_KEY=re_xxx
# ... repetir para cada secret

# Opção 2: Via docker-compose (adicionar ao .env ou docker-compose.yml)
# No arquivo docker-compose.yml, seção edge-functions:
environment:
  - OPENAI_API_KEY=sk-xxx
  - RESEND_API_KEY=re_xxx
  # ... etc

# Opção 3: Via arquivo .env do Supabase Docker
# Adicionar ao /opt/supabase/docker/.env
```

### ⚠️ Nota sobre LOVABLE_API_KEY

O `LOVABLE_API_KEY` é exclusivo do Lovable Cloud e não funciona fora dele. Para substituí-lo:
- As chamadas à IA no `ai-chat` já usam `OPENAI_API_KEY` como fallback
- Verifique se a função `ai-chat` está configurada para usar OpenAI diretamente quando `LOVABLE_API_KEY` não está disponível

---

## 6. Deploy das 70 Edge Functions

### 6.1. Lista completa de Edge Functions

```
admin-create-stripe-subscription    generate-payment-link
admin-reset-password                generate-summary
agenda-pro-confirmation             get-agent-knowledge
agenda-pro-notification             get-billing-status
ai-chat                             get-company-billing-summary
ai-classify                         get-payment-metrics
ai-text-to-speech                   invite-team-member
approve-company                     list-n8n-workflows
auto-reconnect-instances            list-stripe-invoices
check-infrastructure-alerts         meta-api
check-instance-alerts               meta-oauth-callback
cleanup-orphan-lawfirm              meta-webhook
create-checkout-session             n8n-workflow-manager
create-company-admin                process-appointment-reminders
create-global-admin                 process-birthday-messages
create-n8n-workflow                 process-follow-ups
custom-password-reset               process-scheduled-messages
customer-portal                     process-task-due-alerts
delete-client                       process-trial-reminders
delete-company-full                 provision-company
delete-n8n-workflow                 purge-user-by-email
elevenlabs-tts                      register-company
evolution-api                       resend-initial-access
evolution-health                    reset-user-password
evolution-webhook                   retry-failed-workflows
extract-client-facts                send-admin-notification
                                    send-appointment-notification
send-auth-email                     sync-n8n-prompt
send-billing-reminder               sync-stripe-subscriptions
stripe-webhook                      tenant-health-check
sync-evolution-instances            test-email
                                    test-n8n-connection
test-n8n-webhook                    uazapi-webhook
test-openai-key                     update-stripe-subscription
transcribe-audio                    verify-payment
widget-messages
```

### 6.2. Deploy em lote

```bash
cd /var/www/miauchat

# Deploy todas de uma vez
supabase functions deploy --project-ref local

# Ou deploy individual (se precisar depurar)
supabase functions deploy evolution-webhook --project-ref local
supabase functions deploy uazapi-webhook --project-ref local
supabase functions deploy ai-chat --project-ref local
# ... etc
```

### 6.3. Configurar `config.toml` para self-hosted

Copie o `supabase/config.toml` existente. As funções com `verify_jwt = false` são webhooks e cron jobs que recebem chamadas externas:

```toml
# Webhooks (recebem chamadas externas sem JWT)
[functions.evolution-webhook]
verify_jwt = false

[functions.uazapi-webhook]
verify_jwt = false

[functions.meta-webhook]
verify_jwt = false

[functions.stripe-webhook]
verify_jwt = false

[functions.widget-messages]
verify_jwt = false

[functions.agenda-pro-confirmation]
verify_jwt = false

# Cron jobs (chamados via pg_cron/pg_net)
[functions.process-birthday-messages]
verify_jwt = false

[functions.process-appointment-reminders]
verify_jwt = false

[functions.process-trial-reminders]
verify_jwt = false

[functions.process-task-due-alerts]
verify_jwt = false

[functions.check-infrastructure-alerts]
verify_jwt = false

[functions.auto-reconnect-instances]
verify_jwt = false

[functions.cleanup-orphan-lawfirm]
verify_jwt = false

[functions.sync-stripe-subscriptions]
verify_jwt = false

[functions.sync-evolution-instances]
verify_jwt = false

[functions.evolution-health]
verify_jwt = false

[functions.get-billing-status]
verify_jwt = false

[functions.generate-payment-link]
verify_jwt = false

[functions.customer-portal]
verify_jwt = false

[functions.meta-oauth-callback]
verify_jwt = false

[functions.agenda-pro-notification]
verify_jwt = false

[functions.send-appointment-notification]
verify_jwt = false
```

### 6.4. Shared modules

O diretório `supabase/functions/_shared/` contém módulos compartilhados:
- `cors.ts` — Headers CORS
- `encryption.ts` — Encriptação de tokens
- `human-delay.ts` — Delay humanizado para IA
- `rate-limit.ts` — Rate limiting
- `tenant-validation.ts` — Validação multi-tenant
- `whatsapp-provider.ts` — Abstração de provedor WhatsApp

Estes são importados automaticamente pelas funções. No self-hosted, certifique-se de que o diretório `_shared` está presente no deploy.

---

## 7. Configuração de Cron Jobs

No Supabase self-hosted, use `pg_cron` + `pg_net` para agendar chamadas às Edge Functions.

### 7.1. Habilitar extensões

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### 7.2. Configurar cron jobs

```sql
-- ============================================
-- CRON JOBS — MiauChat Self-Hosted
-- ============================================
-- Substitua:
--   YOUR_API_URL = https://api.miauchat.com.br
--   YOUR_ANON_KEY = seu anon key gerado no passo 3
-- ============================================

-- 1. Processar mensagens de aniversário (diário às 08:00 BRT = 11:00 UTC)
SELECT cron.schedule(
  'process-birthday-messages',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/process-birthday-messages',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 2. Processar lembretes de agendamento (a cada 5 minutos)
SELECT cron.schedule(
  'process-appointment-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/process-appointment-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 3. Processar follow-ups agendados (a cada 2 minutos)
SELECT cron.schedule(
  'process-follow-ups',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/process-follow-ups',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 4. Processar mensagens agendadas do Agenda Pro (a cada 1 minuto)
SELECT cron.schedule(
  'process-scheduled-messages',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/process-scheduled-messages',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 5. Verificar alertas de tarefas vencidas (a cada 15 minutos)
SELECT cron.schedule(
  'process-task-due-alerts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/process-task-due-alerts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 6. Lembretes de trial expirando (diário às 10:00 BRT = 13:00 UTC)
SELECT cron.schedule(
  'process-trial-reminders',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/process-trial-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 7. Verificar alertas de infraestrutura (a cada 10 minutos)
SELECT cron.schedule(
  'check-infrastructure-alerts',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/check-infrastructure-alerts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 8. Auto-reconectar instâncias WhatsApp (a cada 30 minutos)
SELECT cron.schedule(
  'auto-reconnect-instances',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/auto-reconnect-instances',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 9. Sincronizar instâncias Evolution (a cada 1 hora)
SELECT cron.schedule(
  'sync-evolution-instances',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/sync-evolution-instances',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 10. Health check Evolution API (a cada 5 minutos)
SELECT cron.schedule(
  'evolution-health',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/evolution-health',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 11. Sincronizar subscriptions Stripe (diário às 03:00 UTC)
SELECT cron.schedule(
  'sync-stripe-subscriptions',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/sync-stripe-subscriptions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 12. Gerar snapshots diários do dashboard (diário às 01:00 BRT = 04:00 UTC)
SELECT cron.schedule(
  'generate-dashboard-snapshots',
  '0 4 * * *',
  $$
  SELECT public.generate_daily_dashboard_snapshots();
  $$
);

-- 13. Limpar orphan law firms (semanal, domingo às 02:00 UTC)
SELECT cron.schedule(
  'cleanup-orphan-lawfirms',
  '0 2 * * 0',
  $$
  SELECT net.http_post(
    url := 'YOUR_API_URL/functions/v1/cleanup-orphan-lawfirm',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);
```

### 7.3. Verificar cron jobs

```sql
-- Listar todos os cron jobs ativos
SELECT * FROM cron.job ORDER BY jobname;

-- Ver execuções recentes
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

---

## 8. Atualização do Frontend

### 8.1. Atualizar variáveis de ambiente

Crie/edite `.env.production` na raiz do projeto:

```bash
# Apontar para o Supabase self-hosted
VITE_SUPABASE_URL=https://api.miauchat.com.br
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ... # Seu novo ANON_KEY gerado no passo 3
VITE_SUPABASE_PROJECT_ID=local

# Environment
VITE_ENVIRONMENT=production
VITE_BASE_DOMAIN=miauchat.com.br
```

### 8.2. Build e deploy

```bash
cd /var/www/miauchat

# Pull do código mais recente
git pull origin main

# Instalar dependências
npm install

# Build com as novas variáveis
npm run build

# Recarregar Nginx
sudo systemctl reload nginx
```

### 8.3. Verificar que o frontend conecta ao novo backend

Abra `https://miauchat.com.br` e verifique no DevTools:
- Network → Requests devem ir para `api.miauchat.com.br`, não mais para `jiragtersejnarxruqyd.supabase.co`

---

## 9. Webhooks — Atualizar URLs de Callback

### 9.1. Evolution API

Acesse o painel da Evolution API e atualize o webhook URL de cada instância:

```
# Antes (Cloud)
https://jiragtersejnarxruqyd.supabase.co/functions/v1/evolution-webhook

# Depois (Self-hosted)
https://api.miauchat.com.br/functions/v1/evolution-webhook
```

Ou via API:

```bash
curl -X PUT "https://evo.miauchat.com.br/webhook/set/INSTANCE_NAME" \
  -H "apikey: SUA_EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.miauchat.com.br/functions/v1/evolution-webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "MESSAGES_UPDATE"
    ]
  }'
```

### 9.2. UazAPI

No painel UazAPI, alterar webhook para:

```
https://api.miauchat.com.br/functions/v1/uazapi-webhook
```

### 9.3. Meta (WhatsApp Cloud API & Instagram)

No [Meta Developers Dashboard](https://developers.facebook.com/):

1. **WhatsApp** → Configuration → Webhook URL:
   ```
   https://api.miauchat.com.br/functions/v1/meta-webhook
   ```

2. **Instagram** → Webhooks → Callback URL:
   ```
   https://api.miauchat.com.br/functions/v1/meta-webhook
   ```

3. **OAuth Redirect URI**:
   ```
   https://api.miauchat.com.br/functions/v1/meta-oauth-callback
   ```

### 9.4. Stripe

No [Stripe Dashboard](https://dashboard.stripe.com/webhooks):

1. Deletar o webhook endpoint antigo
2. Criar novo endpoint:
   ```
   https://api.miauchat.com.br/functions/v1/stripe-webhook
   ```
3. Eventos a registrar:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copiar o novo **Webhook Signing Secret** e atualizar o secret `STRIPE_WEBHOOK_SECRET`

### 9.5. n8n

Se o n8n chama suas Edge Functions via webhook:

```
# Atualizar de
https://jiragtersejnarxruqyd.supabase.co/functions/v1/...

# Para
https://api.miauchat.com.br/functions/v1/...
```

---

## 10. Storage — Migrar Buckets

### 10.1. Listar buckets existentes

```sql
-- No banco Cloud, verificar buckets
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets;
```

Buckets esperados:
- `chat-media` — mídias das conversas WhatsApp
- `avatars` — fotos de perfil
- `knowledge` — arquivos da base de conhecimento
- `agenda-pro` — logos e assets do Agenda Pro

### 10.2. Criar buckets no self-hosted

```sql
-- No banco self-hosted
INSERT INTO storage.buckets (id, name, public) VALUES
  ('chat-media', 'chat-media', false),
  ('avatars', 'avatars', true),
  ('knowledge', 'knowledge', false),
  ('agenda-pro', 'agenda-pro', true);
```

### 10.3. Migrar arquivos

```bash
# Usar supabase CLI ou script custom para baixar do Cloud e upar no self-hosted
# Exemplo com rclone ou script Python:

# 1. Baixar todos os arquivos do bucket
supabase storage ls chat-media --project-ref jiragtersejnarxruqyd

# 2. Upload para o novo
# (Script customizado necessário - Supabase CLI não tem bulk transfer nativo)
```

### 10.4. Recriar Storage Policies

```sql
-- Políticas de storage (recriar no self-hosted)
-- Exemplo para chat-media:
CREATE POLICY "Users can view media from their law firm"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-media' AND
  public.user_has_conversation_access(
    (storage.foldername(name))[1],
    auth.uid()
  )
);

CREATE POLICY "Service role can upload media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-media');
```

---

## 11. Auth — Migrar Configurações

### 11.1. Site URL e Redirect URLs

No arquivo de configuração do GoTrue (`/opt/supabase/docker/.env`):

```bash
GOTRUE_SITE_URL=https://miauchat.com.br
GOTRUE_URI_ALLOW_LIST=https://miauchat.com.br/**,https://www.miauchat.com.br/**,https://*.miauchat.com.br/**
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=seu-google-client-id
GOTRUE_EXTERNAL_GOOGLE_SECRET=seu-google-client-secret
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://api.miauchat.com.br/auth/v1/callback
```

### 11.2. SMTP (emails de auth)

```bash
GOTRUE_SMTP_HOST=smtp.resend.com
GOTRUE_SMTP_PORT=465
GOTRUE_SMTP_USER=resend
GOTRUE_SMTP_PASS=re_xxx  # Sua Resend API Key
GOTRUE_SMTP_ADMIN_EMAIL=noreply@miauchat.com.br
GOTRUE_SMTP_SENDER_NAME=MiauChat
GOTRUE_MAILER_AUTOCONFIRM=false
```

### 11.3. Migrar usuários

Os usuários do `auth.users` são exportados junto com o schema auth. No entanto, **senhas são hashes bcrypt** e serão preservadas.

```bash
# Exportar schema auth (CUIDADO - contém senhas hasheadas)
pg_dump \
  --host=db.jiragtersejnarxruqyd.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=auth \
  --data-only \
  --table=auth.users \
  --table=auth.identities \
  --no-owner \
  --file=auth_users.sql
```

### 11.4. Google OAuth

Atualize no [Google Cloud Console](https://console.cloud.google.com/):

1. **Authorized redirect URIs** — adicionar:
   ```
   https://api.miauchat.com.br/auth/v1/callback
   ```

2. **Authorized JavaScript origins** — adicionar:
   ```
   https://miauchat.com.br
   https://www.miauchat.com.br
   ```

---

## 12. Verificação Pós-Migração

### Checklist de testes

```
[ ] Frontend carrega sem erros no console
[ ] Login com email/senha funciona
[ ] Login com Google funciona
[ ] Listagem de conversas carrega
[ ] Envio de mensagem WhatsApp (Evolution API) funciona
[ ] Envio de mensagem WhatsApp (UazAPI) funciona
[ ] Recebimento de mensagem via webhook funciona
[ ] IA responde corretamente (ai-chat)
[ ] Agendamento via Agenda Pro funciona
[ ] Upload de arquivos no storage funciona
[ ] Download de mídias das conversas funciona
[ ] Dashboard exibe métricas
[ ] Cron jobs estão executando (verificar cron.job_run_details)
[ ] Stripe webhook recebe eventos
[ ] Notificações por email chegam (Resend)
[ ] RLS policies estão ativas (testar acesso cross-tenant)
[ ] Realtime subscriptions funcionam (novas mensagens aparecem em tempo real)
[ ] Painel admin global carrega
[ ] Multi-tenant: subdomínios funcionam
[ ] Kanban e tarefas funcionam
```

### Comandos de verificação

```bash
# Verificar containers Docker
docker compose ps

# Verificar logs de erro
docker compose logs --tail=50 supabase-edge-functions
docker compose logs --tail=50 supabase-auth
docker compose logs --tail=50 supabase-rest

# Verificar Edge Functions respondendo
curl -s https://api.miauchat.com.br/functions/v1/evolution-health

# Verificar banco
docker exec supabase-db psql -U postgres -c "SELECT COUNT(*) FROM public.conversations;"

# Verificar cron jobs
docker exec supabase-db psql -U postgres -c "SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;"
```

---

## 13. Rollback — Como Voltar ao Cloud

Se algo falhar e precisar voltar ao Lovable Cloud:

### 13.1. Reverter o frontend

```bash
# Restaurar .env.production para apontar ao Cloud
VITE_SUPABASE_URL=https://jiragtersejnarxruqyd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M
VITE_SUPABASE_PROJECT_ID=jiragtersejnarxruqyd

# Rebuild e deploy
npm run build
sudo systemctl reload nginx
```

### 13.2. Reverter webhooks

Restaurar todas as URLs de webhook para:
```
https://jiragtersejnarxruqyd.supabase.co/functions/v1/...
```

### 13.3. Sincronizar dados (se houve uso durante migração)

Se houve dados novos no self-hosted durante o período de teste:
```bash
# Exportar dados novos do self-hosted
pg_dump --host=localhost --port=5432 --username=postgres \
  --dbname=postgres --schema=public --data-only \
  --file=data_selfhosted.sql

# Importar no Cloud (com cuidado para não duplicar)
# Recomendado: fazer manualmente para tabelas com dados novos
```

### 13.4. Manter o self-hosted como staging

Uma boa prática é manter a VPS como ambiente de staging/testes, permitindo:
- Testar novas features antes de ir ao Cloud
- Ter um backup quente do banco
- Rodar testes de carga sem afetar produção

---

## Apêndice A: Custo Comparativo

| Item | Lovable Cloud | Self-Hosted (VPS) |
|------|--------------|-------------------|
| Banco de dados | Incluso (até limite) | $0 (Docker) |
| Edge Function invocações | ~$0.01/1000 req | $0 (ilimitado) |
| Storage | ~$0.021/GB/mês | $0 (disco VPS) |
| Auth | Incluso | $0 (GoTrue Docker) |
| VPS mensal | N/A | ~$40-65/mês |
| **Total estimado (25 empresas)** | **~$300-800/mês** | **~$65/mês** |

## Apêndice B: Mapa de Secrets → Edge Functions

```
OPENAI_API_KEY
  ├── ai-chat
  ├── ai-classify
  ├── generate-summary
  ├── extract-client-facts
  └── transcribe-audio

RESEND_API_KEY
  ├── send-auth-email
  ├── send-admin-notification
  ├── invite-team-member
  ├── resend-initial-access
  ├── custom-password-reset
  ├── test-email
  ├── send-billing-reminder
  └── process-trial-reminders

EVOLUTION_BASE_URL + EVOLUTION_GLOBAL_API_KEY
  ├── evolution-api
  ├── evolution-webhook
  ├── evolution-health
  ├── auto-reconnect-instances
  ├── sync-evolution-instances
  └── check-instance-alerts

STRIPE_SECRET_KEY
  ├── create-checkout-session
  ├── customer-portal
  ├── admin-create-stripe-subscription
  ├── update-stripe-subscription
  ├── sync-stripe-subscriptions
  ├── list-stripe-invoices
  ├── get-payment-metrics
  └── get-company-billing-summary

N8N_API_URL + N8N_API_KEY
  ├── create-n8n-workflow
  ├── delete-n8n-workflow
  ├── list-n8n-workflows
  ├── n8n-workflow-manager
  └── sync-n8n-prompt

META_APP_ID + META_APP_SECRET
  ├── meta-webhook
  ├── meta-oauth-callback
  └── meta-api
```

---

> **Documento gerado em:** Fevereiro 2026
> **Versão:** 1.0
> **Projeto:** MiauChat — Plataforma de Comunicação Multicanal
