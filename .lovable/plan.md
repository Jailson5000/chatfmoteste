
# Plano: Hook Centralizado useRealtimeSync

## Resumo Executivo

Criar um hook centralizado `useRealtimeSync` que consolida 18 canais Realtime individuais em 3-4 canais por tenant, reduzindo ~75% do uso de WebSocket e melhorando performance para escalar 250+ usuarios.

---

## Analise dos Canais Atuais

### Mapeamento Completo (18 canais identificados)

| # | Hook/Componente | Nome do Canal | Tabela | Filtro | Evento |
|---|----------------|---------------|--------|--------|--------|
| 1 | useConversations | conversations-realtime | conversations | law_firm_id | * |
| 2 | useConversations | messages-for-conversations | messages | - | INSERT |
| 3 | useConversations | clients-for-conversations | clients | - | UPDATE |
| 4 | useConversations | statuses-for-conversations | custom_statuses | - | * |
| 5 | useConversations | departments-for-conversations | departments | - | * |
| 6 | useMessagesWithPagination | messages-insert-paginated-{id} | messages | conversation_id | INSERT |
| 7 | useMessagesWithPagination | messages-update-paginated-{id} | messages | conversation_id | UPDATE |
| 8 | useConversationCounts | conversation-counts-sync | conversations | law_firm_id | * |
| 9 | useMessageNotifications | messages-notifications | messages | - | INSERT |
| 10 | useScheduledFollowUps | follow-ups-realtime | scheduled_follow_ups | law_firm_id | UPDATE |
| 11 | useCustomStatuses | custom-statuses-realtime-{id} | custom_statuses | law_firm_id | * |
| 12 | useDepartments | departments-realtime-{id} | departments | law_firm_id | * |
| 13 | useTags | tags-realtime-{id} | tags | law_firm_id | * |
| 14 | useWhatsAppInstances | whatsapp-instances-realtime | whatsapp_instances | law_firm_id | * |
| 15 | useDashboardMetrics | dashboard-realtime | messages + conversations | - | * |
| 16 | useAppointments | appointments-realtime | appointments | - | * |
| 17 | useAgendaProAppointments | agenda-pro-appointments-changes | agenda_pro_appointments | law_firm_id | * |
| 18 | useAgendaClients | agenda-clients-realtime | clients | - | * |
| 19 | useInlineActivities | inline-activities-{id} | ai_transfer_logs + client_actions | - | INSERT |
| 20 | ContactDetailsPanel | media-updates-{id} | messages | conversation_id | INSERT/UPDATE |
| 21 | Kanban.tsx | conversations-realtime | conversations | - | * |

**Problema**: Cada usuario pode ter 18+ canais ativos simultaneamente. Com 250 usuarios, isso resulta em ~4.500 conexoes WebSocket.

---

## Estrategia de Consolidacao

### Canal 1: tenant-core-{lawFirmId}
**Tabelas consolidadas:**
- conversations
- clients
- custom_statuses
- departments
- tags
- scheduled_follow_ups
- whatsapp_instances

**Acao no callback:** Invalidar queries relacionadas via QueryClient

### Canal 2: tenant-messages-{lawFirmId}
**Tabelas consolidadas:**
- messages (eventos INSERT e UPDATE)

**Acao no callback:** 
- Notificacoes de nova mensagem
- Invalidacao de metricas
- Atualizacao de contagem de nao lidas

### Canal 3: tenant-agenda-{lawFirmId}
**Tabelas consolidadas:**
- appointments
- agenda_pro_appointments
- agenda_pro_clients

**Acao no callback:** Invalidar queries de agenda

### Canal 4: conversation-specific-{conversationId} (Mantido por conversa ativa)
**Uso especifico:**
- Mensagens da conversa selecionada (INSERT/UPDATE)
- Atividades inline (ai_transfer_logs, client_actions)

**Nota:** Este canal sera criado/destruido dinamicamente quando o usuario seleciona uma conversa

---

## Arquitetura da Solucao

```text
+-----------------------------------------------------------------------------------+
|                            useRealtimeSync Hook                                   |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +------------------+     +------------------+     +------------------+           |
|  |  tenant-core     |     | tenant-messages  |     |  tenant-agenda   |           |
|  +------------------+     +------------------+     +------------------+           |
|  | conversations    |     | messages INSERT  |     | appointments     |           |
|  | clients          |     | messages UPDATE  |     | agenda_pro_*     |           |
|  | custom_statuses  |     +------------------+     +------------------+           |
|  | departments      |                                                             |
|  | tags             |                                                             |
|  | whatsapp_insts   |                                                             |
|  | follow_ups       |                                                             |
|  +------------------+                                                             |
|                                                                                   |
|  +--------------------------------------------------+                             |
|  |          conversation-{id} (dinamico)            |                             |
|  +--------------------------------------------------+                             |
|  | messages (INSERT/UPDATE para conversa ativa)     |                             |
|  | ai_transfer_logs (INSERT)                        |                             |
|  | client_actions (INSERT para client_id)           |                             |
|  +--------------------------------------------------+                             |
|                                                                                   |
+-----------------------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------------------+
|                       Dispatcher de Eventos                                       |
+-----------------------------------------------------------------------------------+
| - Chama queryClient.invalidateQueries() para tabelas afetadas                     |
| - Dispara callbacks customizados (notificacoes, sons, etc)                        |
| - Debounce de 500ms para atualizacoes em lote                                     |
+-----------------------------------------------------------------------------------+
```

---

## Arquivos a Criar/Modificar

### CRIAR

| Arquivo | Descricao |
|---------|-----------|
| src/hooks/useRealtimeSync.tsx | Hook centralizado principal |
| src/contexts/RealtimeSyncContext.tsx | Context para compartilhar estado |

### MODIFICAR (Remover subscriptions individuais)

| Arquivo | Alteracao |
|---------|-----------|
| src/hooks/useConversations.tsx | Remover 5 canais, usar Context |
| src/hooks/useConversationCounts.tsx | Remover 1 canal, usar Context |
| src/hooks/useMessagesWithPagination.tsx | Manter apenas canal especifico por conversa |
| src/hooks/useMessageNotifications.tsx | Remover 1 canal, usar Context |
| src/hooks/useScheduledFollowUps.tsx | Remover 1 canal, usar Context |
| src/hooks/useCustomStatuses.tsx | Remover 1 canal, usar Context |
| src/hooks/useDepartments.tsx | Remover 1 canal, usar Context |
| src/hooks/useTags.tsx | Remover 1 canal, usar Context |
| src/hooks/useWhatsAppInstances.tsx | Remover 1 canal, usar Context |
| src/hooks/useDashboardMetrics.tsx | Remover 1 canal, usar Context |
| src/hooks/useAppointments.tsx | Remover 1 canal, usar Context |
| src/hooks/useAgendaProAppointments.tsx | Remover 1 canal, usar Context |
| src/hooks/useAgendaClients.tsx | Remover 1 canal, usar Context |
| src/hooks/useInlineActivities.tsx | Usar canal especifico por conversa |
| src/components/conversations/ContactDetailsPanel.tsx | Usar canal especifico por conversa |
| src/pages/Kanban.tsx | Remover canal duplicado |
| src/App.tsx | Adicionar RealtimeSyncProvider |

---

## Implementacao do Hook useRealtimeSync

### Interface Principal

```typescript
interface RealtimeSyncConfig {
  lawFirmId: string;
  onNewMessage?: (message: any) => void;
  onConversationUpdate?: (conversation: any) => void;
}

interface RealtimeSyncReturn {
  // Estado de conexao
  isConnected: boolean;
  channelCount: number;
  
  // Para conversa especifica (criado dinamicamente)
  subscribeToConversation: (conversationId: string, clientId?: string) => void;
  unsubscribeFromConversation: () => void;
  activeConversationId: string | null;
}
```

### Logica de Consolidacao por Tabela

```typescript
const CONSOLIDATED_TABLES = {
  'tenant-core': [
    'conversations',
    'clients', 
    'custom_statuses',
    'departments',
    'tags',
    'scheduled_follow_ups',
    'whatsapp_instances'
  ],
  'tenant-messages': ['messages'],
  'tenant-agenda': [
    'appointments',
    'agenda_pro_appointments'
  ]
};
```

---

## Impacto nas Funcionalidades

### Funcionalidades que DEVEM continuar funcionando:

| Funcionalidade | Origem | Acao Necessaria |
|----------------|--------|-----------------|
| Nova mensagem toca som | useMessageNotifications | Callback onNewMessage |
| Badge de nao lidas atualiza | useConversationCounts | invalidateQueries |
| Conversa move para topo | useConversations | invalidateQueries |
| Status do cliente muda | useCustomStatuses | invalidateQueries |
| Card do kanban atualiza | Kanban.tsx | invalidateQueries |
| Indicador de follow-up | useScheduledFollowUps | invalidateQueries |
| Instancia WhatsApp conecta | useWhatsAppInstances | invalidateQueries |
| Dashboard atualiza | useDashboardMetrics | invalidateQueries (debounced) |
| Agendamento criado | useAppointments | invalidateQueries |
| Media na galeria | ContactDetailsPanel | Canal por conversa |
| Atividades inline | useInlineActivities | Canal por conversa |

---

## Reducao Esperada de WebSockets

| Cenario | Antes (canais/usuario) | Depois (canais/tenant) | Reducao |
|---------|------------------------|------------------------|---------|
| 1 usuario, 1 conversa | 18 | 4 | 78% |
| 5 usuarios, mesma empresa | 90 | 4-8 | 91-96% |
| 250 usuarios, 50 empresas | 4.500 | 200-400 | 91-96% |

---

## Sequencia de Implementacao (Ordenada por Risco)

| Fase | Descricao | Risco | Rollback |
|------|-----------|-------|----------|
| 1 | Criar useRealtimeSync e Context (sem remover nada) | Nenhum | Nao aplicavel |
| 2 | Adicionar Provider no App.tsx | Baixo | Remover Provider |
| 3 | Migrar useConversationCounts | Baixo | Restaurar useEffect |
| 4 | Migrar useDepartments, useTags, useCustomStatuses | Baixo | Restaurar useEffect |
| 5 | Migrar useWhatsAppInstances | Baixo | Restaurar useEffect |
| 6 | Migrar useScheduledFollowUps | Medio | Restaurar useEffect |
| 7 | Migrar useConversations (maior impacto) | Alto | Restaurar 5 useEffects |
| 8 | Migrar useMessageNotifications | Medio | Restaurar useEffect |
| 9 | Migrar hooks de Agenda | Baixo | Restaurar useEffects |
| 10 | Migrar useDashboardMetrics | Baixo | Restaurar useEffect |
| 11 | Remover canal duplicado Kanban.tsx | Baixo | Restaurar |
| 12 | Refatorar ContactDetailsPanel e useInlineActivities | Medio | Restaurar |

---

## Testes de Regressao Necessarios

### Criticos (Testar ANTES de deploy)

1. **Chat WhatsApp**
   - Enviar mensagem, verificar se aparece em tempo real
   - Receber mensagem do cliente, verificar som e badge
   - Mudar status de conversa, verificar atualização

2. **Chat Widget**
   - Enviar mensagem pelo widget
   - Verificar se atualiza no painel admin

3. **Kanban**
   - Arrastar card entre colunas
   - Verificar se atualiza em tempo real
   - Nova conversa aparece automaticamente

4. **Notificacoes**
   - Som de nova mensagem
   - Badge de nao lidas no sidebar
   - Contador de abas (Chat, IA, Fila)

5. **Configuracoes**
   - Criar/editar departamento
   - Criar/editar status
   - Criar/editar tag

6. **WhatsApp**
   - Conectar instancia
   - Verificar status de conexao atualiza

7. **Agenda**
   - Criar agendamento
   - Verificar se aparece no calendario

---

## Garantias de Nao-Regressao

1. **Approach incremental**: Cada hook sera migrado individualmente
2. **Context isolado**: useRealtimeSync nao altera comportamento de queries
3. **Fallback disponivel**: Codigo antigo comentado, nao deletado inicialmente
4. **Debounce mantido**: Atualizacoes em lote com 500ms de debounce
5. **Polling como backup**: useMessagesWithPagination mantem polling de 3s

---

## Metricas de Sucesso

- [ ] Numero de canais WebSocket reduzido de ~18/usuario para ~4/tenant
- [ ] Todas as funcionalidades de Realtime continuam funcionando
- [ ] Sem aumento de latencia perceptivel
- [ ] Console limpo (sem erros de Realtime)
- [ ] Dashboard mostra conexoes estaveis
