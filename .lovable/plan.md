

# Respostas e Plano de Migração Self-Hosted

## 1. WhatsApp Cloud API reduz requisições?

**Não significativamente.** O número de invocações de Edge Functions é proporcional ao volume de **mensagens recebidas**, não ao provedor. Comparação:

| Provedor | Webhook | Invocações por msg recebida |
|---|---|---|
| Evolution API | `evolution-webhook` | 1 |
| UazAPI | `uazapi-webhook` | 1 |
| WhatsApp Cloud (Meta) | `meta-webhook` | 1 |

Todos os provedores disparam **1 chamada de Edge Function por evento de webhook**. A diferença é que a Evolution API e UazAPI enviam eventos extras (CONNECTION_UPDATE, QRCODE_UPDATED, status ticks) que são filtrados no fast-filter, mas esses são bloqueados antes de executar lógica pesada. O WhatsApp Cloud API da Meta também envia eventos de status (delivered, read) que passam pelo `meta-webhook`.

**O que realmente reduz custos:** migrar para Supabase self-hosted, onde Edge Functions rodam no seu Deno Deploy/Docker sem cobrança por invocação.

## 2. É possível migrar saindo do Lovable Cloud?

**Sim.** O Lovable Cloud usa Supabase por baixo. Você pode:
- Exportar o schema completo (DDL) + dados via `pg_dump`
- Instalar Supabase self-hosted em uma VPS
- Restaurar o banco, configurar secrets, e deployar as Edge Functions
- O frontend continua sendo servido do VPS (já documentado em `VPS-DEPLOY-GUIDE.md`)

O projeto Lovable continua existindo (não pode ser desconectado do Cloud), mas você simplesmente aponta o frontend para a nova instância Supabase.

## 3. Plano: Gerar arquivo de migração completo

### Arquivo a criar: `docs/MIGRATION-SELF-HOSTED.md`

Conteúdo abrangendo:

1. **Pré-requisitos** — VPS specs (8GB RAM, 4 vCPU), Docker, domínio
2. **Exportação do banco** — Comandos pg_dump para schema + dados, lista das 90+ tabelas
3. **Instalação Supabase Self-Hosted** — docker-compose, configuração JWT, dashboard
4. **Restauração do banco** — pg_restore, criação de funções, triggers, views, RLS policies
5. **Migração dos 27 secrets** — Lista completa com onde obter cada um
6. **Deploy das 65+ Edge Functions** — supabase functions deploy, configuração do config.toml
7. **Configuração de Cron Jobs** — pg_cron para as 8+ funções agendadas (birthday, follow-ups, reminders, etc.)
8. **Atualização do Frontend** — Trocar VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
9. **Webhooks** — Atualizar URLs de callback na Evolution API, UazAPI, Meta, Stripe
10. **Storage** — Migrar buckets (chat-media, etc.)
11. **Auth** — Migrar configurações de email, redirect URLs, Google OAuth
12. **Verificação pós-migração** — Checklist de testes
13. **Rollback** — Como voltar ao Cloud se algo falhar

### Dados técnicos incluídos

- Lista completa das Edge Functions (65+) com dependências
- Mapa de secrets → funções que os utilizam
- Tabelas críticas com ordem de restauração (respeitar FKs)
- Cron jobs com schedule exato
- Configurações de webhook por provedor

