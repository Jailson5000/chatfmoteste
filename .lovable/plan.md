
# Plano: Otimização de Performance do Conversations.tsx

## Diagnóstico Atual

### Tamanho das Tabelas (Produção Atual)
| Tabela | Registros | Tamanho |
|--------|-----------|---------|
| messages | 1.964 | 1.1 MB |
| conversations | 133 | 288 KB |
| clients | 138 | 200 KB |

**Projeção para 50 empresas (2.500-5.000 conversas/dia):**
- Messages: ~500.000+/mês → 50-100 MB
- Conversations: ~5.000-10.000 ativas

### Gargalos Identificados

**1. Índice Crítico Faltante**
A query de mensagens (`useMessagesWithPagination`) usa:
```sql
SELECT ... FROM messages 
WHERE conversation_id = ? 
ORDER BY created_at DESC LIMIT 35
```
**Problema:** Não existe índice `(conversation_id, created_at)`. O planner usa `idx_messages_is_internal` que não é otimizado para ordenação.

**2. Arquivo Monolítico**
`Conversations.tsx` tem 4.423 linhas com:
- 40+ estados (`useState`)
- 15+ refs (`useRef`)
- 20+ handlers de eventos
- Múltiplos dialogs inline

**3. Canais Realtime Duplicados**
O `useConversations.tsx` ainda cria 5 canais Realtime próprios (linhas 247-340), duplicando o trabalho do `RealtimeSyncContext` recém-implementado.

---

## Fase 1: Índices de Banco (Impacto Alto, Risco Baixo)

### 1.1 Índice Composto para Messages
```sql
CREATE INDEX CONCURRENTLY idx_messages_conv_created 
ON public.messages (conversation_id, created_at DESC);
```
**Impacto:** Query de mensagens 5-10x mais rápida em volumes altos.

### 1.2 Índice para Ordenação de Conversations
```sql
CREATE INDEX CONCURRENTLY idx_conversations_law_firm_order 
ON public.conversations (law_firm_id, COALESCE(last_message_at, created_at) DESC);
```
**Impacto:** RPC `get_conversations_with_metadata` otimizado para ordenação.

---

## Fase 2: Remover Canais Realtime Duplicados

**Arquivo:** `src/hooks/useConversations.tsx`

**Remover linhas 243-341** (5 canais criados manualmente):
- `conversations-realtime`
- `messages-for-conversations`
- `clients-for-conversations`
- `statuses-for-conversations`
- `departments-for-conversations`

**Substituir por:** Uso do `RealtimeSyncContext` já configurado, que consolida tudo em 3-4 canais globais.

```tsx
// ANTES: 5 canais separados criados no hook
const conversationsChannel = supabase.channel('conversations-realtime')...
const messagesChannel = supabase.channel('messages-for-conversations')...
// ... etc

// DEPOIS: Usa o contexto centralizado (já invalida queries automaticamente)
// Nenhum código de canal necessário - RealtimeSyncProvider já faz isso
```

---

## Fase 3: Refatoração do Conversations.tsx (Modular)

### Estrutura Proposta
```text
src/pages/Conversations/
├── index.tsx                    # Componente principal (orquestrador)
├── ConversationsSidebar.tsx     # Lista lateral de conversas
├── ConversationsChat.tsx        # Área de mensagens
├── ConversationsHeader.tsx      # Header com filtros e ações
├── dialogs/
│   ├── ArchiveDialog.tsx
│   ├── SummaryDialog.tsx
│   ├── EditNameDialog.tsx
│   └── InstanceChangeDialog.tsx
└── hooks/
    ├── useConversationsState.tsx     # Estados centralizados
    ├── useConversationsFilters.tsx   # Lógica de filtros
    └── useConversationsHandlers.tsx  # Event handlers
```

### Benefícios
- Componentes menores = re-renders mais granulares
- Melhor tree-shaking e code splitting
- Facilita manutenção e testes
- React.memo efetivo por componente

---

## Fase 4: Otimizações de Rendering

### 4.1 Memoização de Listas
```tsx
// ConversationsSidebar.tsx
const MemoizedConversationCard = React.memo(ConversationSidebarCard);

const filteredConversations = useMemo(() => {
  // Aplicar filtros apenas quando dependências mudam
}, [conversations, filters, activeTab]);
```

### 4.2 Virtualização para Listas Grandes
Para 500+ conversas, considerar `react-window` ou `@tanstack/virtual`:
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

// Renderiza apenas conversas visíveis na viewport
```

---

## Resumo de Impacto

| Otimização | Impacto | Esforço | Risco |
|------------|---------|---------|-------|
| Índice messages | Alto | Baixo | Mínimo |
| Índice conversations | Médio | Baixo | Mínimo |
| Remover canais duplicados | Médio | Baixo | Baixo |
| Refatoração modular | Alto | Alto | Médio |
| Virtualização | Médio | Médio | Baixo |

---

## Ordem de Execução Recomendada

1. **Índices SQL** (15 min) - Impacto imediato, zero risco
2. **Remover canais duplicados** (30 min) - Reduz overhead de WebSocket
3. **Refatoração modular** (2-4h) - Melhora manutenibilidade
4. **Virtualização** (futuro) - Quando houver 500+ conversas por tenant

---

## Detalhes Técnicos

### Migração SQL Completa
```sql
-- =============================================
-- ÍNDICES DE PERFORMANCE PARA CONVERSAS
-- =============================================

-- 1. Índice crítico para paginação de mensagens
-- Query: WHERE conversation_id = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created 
ON public.messages (conversation_id, created_at DESC);

-- 2. Índice para ordenação de conversas no RPC
-- Query: WHERE law_firm_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_law_firm_order 
ON public.conversations (law_firm_id, last_message_at DESC NULLS LAST, created_at DESC);

-- 3. Índice para count de mensagens não lidas (usado no RPC)
-- Query: COUNT(*) WHERE conversation_id = ? AND is_from_me = false AND read_at IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_unread 
ON public.messages (conversation_id) 
WHERE is_from_me = false AND read_at IS NULL;
```

### Cleanup do useConversations.tsx
```tsx
// REMOVER estas linhas (243-341):
useEffect(() => {
  if (!lawFirm?.id) return;
  
  const conversationsChannel = supabase.channel('conversations-realtime')...
  const messagesChannel = supabase.channel('messages-for-conversations')...
  const clientsChannel = supabase.channel('clients-for-conversations')...
  const statusesChannel = supabase.channel('statuses-for-conversations')...
  const departmentsChannel = supabase.channel('departments-for-conversations')...
  // ... todo o bloco de cleanup
}, [queryClient, lawFirm?.id]);

// O RealtimeSyncContext já faz tudo isso automaticamente!
```
