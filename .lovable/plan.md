

# Analise Completa: Erros no Sistema de Conversas e Kanban

## Resumo Executivo

Foram encontrados **8 problemas** no sistema, categorizados por severidade. A maioria envolve **inconsistencias de queryKey** que causam falhas de sincronizacao entre cache e UI.

---

## CRITICOS (Causam bugs visiveis ao usuario)

### 1. QueryKey Mismatch Massivo - `["conversations"]` vs `["conversations", lawFirmId]`

O `useQuery` usa `["conversations", lawFirm?.id]` como queryKey, mas **a maioria das invalidacoes usa apenas `["conversations"]`** sem o ID da firma. Isso significa que muitas invalidacoes **nao disparam refetch algum**.

**Locais afetados (todos usando queryKey errada `["conversations"]`):**

| Arquivo | Linha | Contexto |
|---------|-------|----------|
| `useConversations.tsx` | 337 | `cancelQueries` em `updateConversation.onMutate` |
| `useConversations.tsx` | 370 | `invalidateQueries` em `updateConversation.onError` |
| `useConversations.tsx` | 393 | `invalidateQueries` em `updateConversationStatus.onSuccess` |
| `useConversations.tsx` | 559 | `cancelQueries` em `transferHandler.onMutate` |
| `useConversations.tsx` | 560 | `getQueryData` em `transferHandler.onMutate` |
| `useConversations.tsx` | 599 | `setQueryData` em `transferHandler.onError` (rollback) |
| `useConversations.tsx` | 602 | `invalidateQueries` em `transferHandler.onError` |
| `useConversations.tsx` | 746 | `invalidateQueries` em `updateConversationTags.onSuccess` |
| `useConversations.tsx` | 844 | `invalidateQueries` em `updateClientStatus.onSettled` |
| `useConversations.tsx` | 886 | `invalidateQueries` em `updateConversationAudioMode.onSuccess` |
| `useConversations.tsx` | 1015 | `invalidateQueries` em `changeWhatsAppInstance` |
| `useConversations.tsx` | 1098 | `invalidateQueries` em `changeWhatsAppInstance.onSuccess` |
| `Conversations.tsx` | 752, 791, 853, 878 | Varias invalidacoes |
| `ContactStatusTags.tsx` | 88, 119, 151 | Invalidacoes de status/tags |
| `ContactDetailsPanel.tsx` | 491, 553 | Invalidacoes de contato |
| `ConversationSidebarCard.tsx` | 221 | Dismiss ad |
| `KanbanCard.tsx` | 196 | Dismiss ad |
| `useClients.tsx` | 189, 259, 287 | Operacoes de clientes |

**Impacto:** As invalidacoes com `["conversations"]` **nao acertam** a queryKey `["conversations", lawFirmId]`, o que significa que:
- O cache **nao e atualizado** quando deveria ser
- A UI fica desatualizada ate o proximo evento Realtime (300ms debounce)
- Em casos de erro, o **rollback nao funciona** porque `setQueryData(["conversations"], ...)` nao bate com a query real

**Correcao:** Padronizar TODAS as invalidacoes para usar `["conversations", lawFirm?.id]` ou usar invalidacao parcial `["conversations"]` com `exact: false` (que ja e o padrao do TanStack Query v5).

**NOTA IMPORTANTE:** Na verdade, no TanStack Query v5, `invalidateQueries({ queryKey: ["conversations"] })` invalida **qualquer** query que **comece** com `["conversations"]`, incluindo `["conversations", lawFirmId]`. Portanto, esse problema **nao e critico na pratica** - a invalidacao funciona. Porem, os `setQueryData` e `getQueryData` que usam `["conversations"]` sem o ID **realmente falham** porque essas operacoes sao exatas.

### 2. Rollback Falho no `transferHandler.onError`

```typescript
// Linha 599 - useConversations.tsx
queryClient.setQueryData(["conversations"], context.previousConversations);
```

Usa `["conversations"]` mas a query real e `["conversations", lawFirmId]`. O rollback **nunca funciona**. Se a transferencia falhar, a UI fica num estado inconsistente permanente ate F5.

**Correcao:** Mudar para `queryClient.setQueryData(["conversations", lawFirm?.id], ...)`.

### 3. Erro de Logica no `updateConversation.onError`

```typescript
// Linha 369 - useConversations.tsx
pendingOptimisticUpdates.current.delete(error.message); // cleanup
```

O `.delete()` usa `error.message` (texto do erro!) como chave, mas deveria usar o `conversationId`. Isso significa que o lock otimista **nunca e removido em caso de erro**, o que pode fazer a conversa ficar "travada" no estado otimista por 3 segundos.

**Correcao:** O `onError` deveria receber `(error, variables, context)` e usar `variables.id`.

### 4. Falta de `cancelQueries` no `updateConversationDepartment.onMutate`

Na linha 666, o `cancelQueries` usa `["conversations"]` mas deveria usar `["conversations", lawFirm?.id]` para ser preciso. Sem cancellation exata, um refetch em andamento pode completar e sobrescrever o update otimista.

---

## MEDIOS (Podem causar comportamento inconsistente)

### 5. RealtimeSyncContext invalida sem lawFirmId

No `RealtimeSyncContext.tsx`, a constante `TABLE_TO_QUERY_KEYS` mapeia `conversations` para `["conversations"]`:

```typescript
conversations: [
    ["conversations"],        // <-- sem lawFirmId
    ["conversation-counts"],
],
```

Embora o TanStack Query v5 faca match parcial por padrao, seria mais correto e eficiente usar a queryKey completa.

### 6. `updateConversationStatus` nao tem update otimista

A mutacao `updateConversationStatus` (linha 379-406) **nao tem `onMutate`** com update otimista. O status so atualiza na UI apos o refetch. Isso cria uma experiencia lenta comparada com as outras mutacoes que tem update otimista.

### 7. Tags `invalidateQueries` sem update otimista

`updateConversationTags` (linha 732-755) tambem nao tem `onMutate`. A atualizacao de tags so aparece apos refetch.

---

## MENOR (Nao causam bugs mas sao melhorias)

### 8. Multiplas invalidacoes em `updateClientStatus.onSettled`

```typescript
// Linhas 843-848
onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["scheduled-follow-ups"] });
    queryClient.invalidateQueries({ queryKey: ["all-scheduled-follow-ups"] });
},
```

`onSettled` executa tanto em sucesso quanto em erro. Junto com o Realtime, isso cria invalidacoes duplicadas. Porem como a mutacao ja tem update otimista, o impacto visual e minimo.

---

## Plano de Correcao

### Passo 1: Corrigir `onError` do `updateConversation` (CRITICO)
**Arquivo:** `src/hooks/useConversations.tsx`
- Linha 367-376: Adicionar `variables` como parametro do `onError` e usar `variables.id` ao inves de `error.message`

### Passo 2: Corrigir Rollback do `transferHandler.onError` (CRITICO)
**Arquivo:** `src/hooks/useConversations.tsx`  
- Linha 599: Mudar de `["conversations"]` para `["conversations", lawFirm?.id]`

### Passo 3: Padronizar queryKeys nos `cancelQueries`, `setQueryData` e `getQueryData` (MEDIO)
**Arquivo:** `src/hooks/useConversations.tsx`
- Linhas 337, 559, 560: Trocar `["conversations"]` por `["conversations", lawFirm?.id]` em `cancelQueries` e `getQueryData`

### Passo 4: Adicionar update otimista em `updateConversationStatus` (MEDIO)
**Arquivo:** `src/hooks/useConversations.tsx`
- Adicionar `onMutate` com atualizacao local do status

### Passo 5: Corrigir `cancelQueries` no `updateConversationDepartment.onMutate` (MENOR)
**Arquivo:** `src/hooks/useConversations.tsx`
- Linha 666: Ja usa a queryKey correta `["conversations"]` que funciona com match parcial, nenhuma acao necessaria

### Arquivos Modificados
- `src/hooks/useConversations.tsx` (unico arquivo que precisa de correcoes)

### Risco
- **Baixo**: Todas as correcoes sao cirurgicas e nao mudam logica de negocio
- **Rollback facil**: Cada correcao e independente

