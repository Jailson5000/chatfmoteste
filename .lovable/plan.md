

# Diagnóstico: O Que Consome Cloud no Lovable

## Como Funciona a Cobrança Cloud

O custo "Cloud" na Lovable é baseado em **três pilares**:

| Recurso | O que conta |
|---|---|
| **Edge Functions** | Cada invocação + tempo de execução (ms). Principal custo. |
| **Database (PostgREST)** | Cada query REST API (select, insert, update, rpc). Cobrado por request. |
| **Realtime** | Conexões WebSocket ativas + mensagens broadcast. Custo contínuo. |

Armazenamento e banda também contam, mas no seu caso são secundários.

---

## Onde Está o Consumo no Seu Projeto

### 1. Polling Constante (Maior Vilão)

Enquanto um usuário está logado, o frontend faz queries automáticas ao banco **a cada 30 segundos**, independente de haver atividade:

| Hook | Intervalo | Query |
|---|---|---|
| `useConversationCounts` | 30s | RPC `get_conversation_tab_counts` |
| `useMaintenanceMode` | 30s | SELECT `system_settings` |
| `useSystemAlert` | 30s | SELECT `system_settings` |
| `useAdminNotifications` | 30s | SELECT notifications |
| `useScheduledFollowUps` | 60s | SELECT `scheduled_follow_ups` |
| `AgendaProScheduledMessages` | 60s | SELECT agenda messages |

**Cálculo**: Com 1 usuário logado 8h/dia:
- 6 queries × 2/min (a cada 30s) = **12 queries/min**
- 8 horas = **5.760 queries/dia** só de polling
- Com 2-3 usuários simultâneos: **~15.000 queries/dia**
- Em 30 dias: **~450.000 requests** só de polling

### 2. Realtime WebSocket (Custo Contínuo)

Cada usuário logado mantém **4-5 canais Realtime** abertos:

- `tenant-core` (7 tabelas monitoradas)
- `tenant-messages`
- `tenant-agenda`
- `conversation-{id}` (quando abre um chat)
- `presence:{lawFirmId}` (tracking de presença)

Cada mudança no banco dispara um broadcast para todos os canais conectados. Com WhatsApp ativo, cada mensagem recebida gera múltiplos eventos Realtime.

### 3. Webhooks Externos (WhatsApp)

Cada mensagem WhatsApp recebida dispara:
- **1 invocação** de `evolution-webhook` (ou `uazapi-webhook`)
- Que internamente faz **5-15 queries** ao banco (buscar instância, conversa, cliente, inserir mensagem, etc.)
- Tempo de execução: **600ms a 18 segundos** (vi nos logs)
- Se IA responde: + `ai-chat` + possível `ai-text-to-speech`

Com ~680 conversas/mês e múltiplas mensagens por conversa, isso pode facilmente ser **milhares de invocações/mês** com tempo de execução alto.

### 4. Admin Global (Se Acessado)

As páginas de admin fazem queries pesadas:
- `GlobalAdminPayments`: 3 Edge Functions (`get-payment-metrics`, `get-billing-status`, `list-stripe-invoices`) com polling a cada 60-120s
- `InfrastructureMetrics`: 3 RPCs a cada 5 minutos
- `CompanyUsageTable`: query complexa a cada 2 minutos

---

## Resumo do Consumo Estimado (Mensal)

| Fonte | Requests/mês | % do Custo |
|---|---|---|
| Polling frontend (30s intervals) | ~450.000 | **~40%** |
| Realtime broadcasts (WhatsApp + mudanças) | ~200.000 | **~20%** |
| Webhooks WhatsApp (Edge Functions) | ~50.000-100.000 | **~25%** |
| Queries sob demanda (abrir chat, dashboard) | ~50.000 | **~10%** |
| Admin Global (se acessado) | ~10.000 | **~5%** |

---

## Plano de Otimização

### Prioridade 1: Reduzir Polling (Impacto: ~40% do custo)

**`useMaintenanceMode` e `useSystemAlert`** — Esses dados mudam **quase nunca**. Polling a cada 30s é absurdo.

- Aumentar `refetchInterval` de 30s para **5 minutos** (300.000ms)
- Ou melhor: remover polling e usar **Realtime** na tabela `system_settings` (já está no canal core)
- Economia: **~260.000 requests/mês**

**`useConversationCounts`** — Já recebe updates via Realtime. O polling de 30s é redundante.

- Aumentar para **2 minutos** ou remover o polling (Realtime já invalida o cache)
- Economia: **~86.000 requests/mês**

**`useAdminNotifications`** — Polling 30s para notificações de admin.

- Aumentar para **2-5 minutos**
- Economia: **~43.000 requests/mês**

### Prioridade 2: Consolidar Queries Duplicadas

`useMaintenanceMode` e `useSystemAlert` fazem **2 queries separadas** à mesma tabela `system_settings` a cada 30s. Consolidar em uma única query.

### Prioridade 3: Otimizar Edge Functions de Webhook

As funções `evolution-webhook` e `uazapi-webhook` têm execuções de **até 18 segundos**. Cada segundo de runtime conta no Cloud. Revisar:

- Reduzir queries internas desnecessárias
- Paralelizar lookups independentes com `Promise.all`
- Cachear dados que não mudam (configurações da empresa)

### Prioridade 4: Presença via Realtime

O `usePresenceTracking` já é eficiente (throttled a 5min para DB updates), mas cada presence channel é um WebSocket ativo. Sem mudança necessária aqui.

---

## Resumo de Mudanças Propostas

| Arquivo | Mudança | Economia Estimada |
|---|---|---|
| `useMaintenanceMode.tsx` | `refetchInterval: 30000` → `300000` (5 min) | ~43K req/mês |
| `useSystemAlert.tsx` | `refetchInterval: 30000` → `300000` (5 min) | ~43K req/mês |
| `useConversationCounts.tsx` | `refetchInterval: 30000` → `120000` (2 min) | ~65K req/mês |
| `useAdminNotifications.tsx` | `refetchInterval: 30000` → `120000` (2 min) | ~43K req/mês |
| `useScheduledFollowUps.tsx` | `refetchInterval: 60000` → `300000` (5 min) | ~14K req/mês |
| Consolidar maintenance + alert | Uma query em vez de duas | ~43K req/mês |
| **Total** | | **~250K requests/mês a menos** |

Isso deve reduzir o consumo Cloud em **~30-40%** sem nenhum impacto funcional visível, já que o Realtime já cobre as atualizações críticas em tempo real.

