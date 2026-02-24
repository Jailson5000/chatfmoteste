

# Analise Completa: Agenda Pro (Notificacoes, Alertas, Lembretes) e Tarefas

## Resumo

Analisei todos os fluxos de automacao da Agenda Pro e do modulo de Tarefas. O sistema esta **bem estruturado** com cron jobs ativos e edge functions configuradas. Encontrei **2 problemas** e **1 ponto de atencao**.

---

## Cron Jobs Ativos (Confirmado no banco)

| Job | Schedule | Status |
|---|---|---|
| `process-agenda-pro-scheduled-messages` | A cada 5 min | OK |
| `process-appointment-reminders` | A cada 5 min | **Problema** (ver abaixo) |
| `process-task-due-alerts-hourly` | A cada hora | OK |
| `process-follow-ups-every-2min` | A cada 5 min | OK |
| `process-birthday-messages-hourly` | A cada hora | OK |

---

## Problema 1: `process-appointment-reminders` usa tabela ERRADA

A funcao `process-appointment-reminders` consulta as tabelas **`appointments`** e **`services`** (modulo Agenda antigo), NAO as tabelas **`agenda_pro_appointments`** e **`agenda_pro_services`** (Agenda Pro).

Isso significa que este cron job **nao faz nada para a Agenda Pro** — ele so processa agendamentos do modulo legado.

**Porem**, a Agenda Pro tem seu proprio pipeline de lembretes:
- `process-scheduled-messages` → busca da tabela `agenda_pro_scheduled_messages` → chama `agenda-pro-notification`

Entao **os lembretes da Agenda Pro funcionam via `process-scheduled-messages`**, nao via `process-appointment-reminders`. O fluxo esta correto.

**Decisao**: O `process-appointment-reminders` pode ser **ignorado** para a Agenda Pro — ele serve ao modulo Agenda antigo. Nenhuma correcao necessaria aqui, a menos que o modulo legado ainda esteja em uso.

---

## Problema 2: `process-task-due-alerts` — WhatsApp so funciona com Evolution API

No arquivo `supabase/functions/process-task-due-alerts/index.ts`, o envio de alertas via WhatsApp (linhas 190-243) busca a instancia da tabela `whatsapp_instances` mas depois busca a URL base da tabela `evolution_api_connections`:

```typescript
const { data: evolutionConnection } = await supabase
  .from("evolution_api_connections")
  .select("base_url, global_api_key")
  .eq("is_default", true)
  .maybeSingle();
```

Se a empresa usa **UAZAPi** (como e o caso atual), a `evolution_api_connections` nao tera match e os alertas de tarefas via WhatsApp **falham silenciosamente**. A funcao nao suporta UAZAPi.

### Correcao necessaria

Atualizar `process-task-due-alerts` para usar `api_url` e `api_key` diretamente da tabela `whatsapp_instances` (como ja fazem `process-scheduled-messages` e `agenda-pro-notification`), com deteccao de UAZAPi vs Evolution:

```typescript
// Usar api_url e api_key da instancia diretamente
const apiUrl = instance.api_url.replace(/\/+$/, "");
const isUazapi = apiUrl.toLowerCase().includes("uazapi");

const endpoint = isUazapi
  ? `${apiUrl}/send/text`
  : `${apiUrl}/message/sendText/${instance.instance_name}`;
const headers = isUazapi
  ? { "Content-Type": "application/json", token: instance.api_key }
  : { "Content-Type": "application/json", apikey: instance.api_key };
```

---

## Ponto de Atencao: Logs de execucao vazios

A query de analytics para `process-scheduled-messages`, `process-task-due-alerts` e `process-appointment-reminders` retornou **zero resultados** nos logs recentes. Isso pode significar:
- Os cron jobs estao executando mas os logs ja foram rotacionados
- Ou nao ha agendamentos/tarefas pendentes no momento

Isso nao e necessariamente um bug — apenas indica que nao ha dados recentes para processar.

---

## Agenda Pro — Fluxo Completo (Funcionando)

```text
Agendamento criado
    |
    v
agenda-pro-notification (type: "created")
    |---> WhatsApp: confirmacao + link
    |---> Email: confirmacao + link
    |---> Notifica profissional
    |---> Cria/atualiza conversa no sistema
    |
    v
agenda_pro_scheduled_messages (tabela)
    |---> reminder (24h antes)
    |---> reminder_2 (configuravel, ex: 55min)
    |---> pre_message (horas antes, se servico configurado)
    |
    v
process-scheduled-messages (cron 5min)
    |---> Busca pendentes
    |---> Chama agenda-pro-notification
    |---> Marca como enviado
    |---> Retry ate 3x em caso de falha
```

Este fluxo esta **correto e funcional** para ambos UAZAPi e Evolution API (a funcao `agenda-pro-notification` detecta automaticamente o provedor).

---

## Tarefas — Fluxo Completo

```text
Tarefa criada com due_date + send_due_alert=true
    |
    v
process-task-due-alerts (cron horario)
    |---> Verifica law_firm_settings.task_alert_enabled
    |---> Verifica horario comercial (se configurado)
    |---> Busca tarefas com vencimento proximo
    |---> Envia por canais configurados:
    |     |---> Email (via Resend) ✅ OK
    |     |---> WhatsApp ❌ PROBLEMA (so Evolution)
    |---> Registra em task_alert_logs (evita duplicatas)
```

UI: A pagina `Tasks.tsx` esta completa com Kanban, Lista, Calendario, Dashboard, Filtros, Categorias e `TaskAlertsSettingsDialog` para configurar alertas.

---

## Plano de Correcao

| Arquivo | Mudanca | Impacto |
|---|---|---|
| `supabase/functions/process-task-due-alerts/index.ts` | Usar `api_url`/`api_key` da instancia direto + detectar UAZAPi vs Evolution | Alertas de tarefas via WhatsApp funcionarao em empresas com UAZAPi |

### Detalhes tecnicos da correcao

Na funcao `process-task-due-alerts/index.ts`, substituir o bloco de WhatsApp (linhas 190-243) para:

1. Buscar `api_url` e `api_key` na query de `whatsapp_instances` (ja existem na tabela)
2. Remover a dependencia de `evolution_api_connections`
3. Detectar se e UAZAPi pela URL e usar endpoint/headers corretos
4. Adicionar logging de sucesso/falha

Nenhuma mudanca de banco necessaria. Nenhuma mudanca no frontend.

