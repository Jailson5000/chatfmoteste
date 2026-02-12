
# Correcao: Status e Etiquetas nao atualizam em tempo real pelo menu do painel

## Resposta: A partir de quantas conversas o erro anterior acontecia?

O sistema carrega conversas em lotes de **30**. Portanto, a partir da **31a conversa** (a mais antiga), qualquer mudanca feita pelo painel lateral nao era refletida no board sem F5, porque essa conversa nao existia no cache compartilhado do React Query (apenas no estado local `allConversations` da instancia errada do hook).

---

## Causa Raiz (Status)

O `KanbanChatPanel` usa `updateClientStatus` do hook `useClients()` (linha 1094):

```text
const { updateClientStatus, updateClient } = useClients();
```

Esse `updateClientStatus` do `useClients` **nao tem update otimista** no `allConversations`. Ele apenas faz `invalidateQueries(["conversations"])` no `onSuccess`, que:
- Para conversas recentes (dentro das 30 primeiras): funciona porque o refetch as inclui
- Para conversas antigas (alem das 30): o refetch nao as inclui, entao o card nao atualiza

Enquanto isso, o `useConversations()` tem seu proprio `updateClientStatus` (linhas 798-890) com update otimista completo que chama `setAllConversations()` diretamente -- mas o painel nunca o usa.

**O drag-and-drop de status no Kanban tambem usa `useClients().updateClientStatus`**, mas funciona porque o Kanban.tsx esta na mesma instancia onde o `invalidateQueries` dispara o re-render com os dados do cache.

## Causa Raiz (Etiquetas/Tags)

O `handleTagToggle` no painel (linhas 2619-2685) faz operacoes diretas no Supabase (`supabase.from("client_tags").insert/delete`) sem passar por nenhuma mutacao do `useConversations`. Ele atualiza apenas o cache de `["client_tags", clientId]` e invalida `["clients"]`. A tag no card do Kanban vem do campo `conversation.tags`, que esta em `allConversations` -- mas nada atualiza esse campo localmente.

A invalidacao de `["conversations"]` foi removida na ultima correcao (corretamente, para evitar race conditions nos departamentos). Porem, sem ela, as tags nao tem NENHUM mecanismo de atualizacao no board, nem otimista nem por refetch.

A solucao para tags e diferente: como tags sao armazenadas na tabela `client_tags` (nao na conversa), e o Realtime ja escuta mudancas na tabela `clients`, a atualizacao vem naturalmente pelo Realtime quando o campo `clients` muda. Porem, tags nao alteram a tabela `clients` diretamente -- elas estao em `client_tags`, que **nao tem listener Realtime**.

---

## Plano de Correcao

### Correcao 1: Passar `updateClientStatus` do `useConversations` para o painel (CRITICO)

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`
- Adicionar prop `updateClientStatusMutation` na interface `KanbanChatPanelProps`
- No componente, usar `updateClientStatusMutation ?? localConversations.updateClientStatus` em vez de `useClients().updateClientStatus`
- Atualizar `handleStatusChange` para usar essa mutacao efetiva

**Arquivo:** `src/pages/Kanban.tsx`
- Extrair `updateClientStatus` do `useConversations()` (ja esta disponivel no retorno do hook)
- Passar como prop `updateClientStatusMutation={updateClientStatus}` para o `KanbanChatPanel`

### Correcao 2: Invalidar `["conversations"]` apos mudanca de tags (MEDIO)

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`
- No `handleTagToggle`, **re-adicionar** `queryClient.invalidateQueries({ queryKey: ["conversations"] })` com um `setTimeout` de 1 segundo
- Isso e necessario porque tags nao passam por nenhuma mutacao com update otimista, e a tabela `client_tags` nao tem listener Realtime
- O setTimeout garante que o banco ja propagou a mudanca antes do refetch
- Alternativa mais robusta: adicionar update otimista no `allConversations` atualizando o campo `tags` da conversa localmente

### Correcao 3: Atualizar tags otimisticamente no `allConversations` (IDEAL)

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`
- No `handleTagToggle`, alem da operacao no Supabase, chamar uma funcao para atualizar `allConversations` localmente
- Para isso, precisamos de acesso ao `setAllConversations` ou a uma mutacao do `useConversations`
- A abordagem mais limpa: usar `updateConversationTags` do `useConversations()` se disponivel, ou passar `setAllConversations` via prop

**Arquivo:** `src/hooks/useConversations.tsx`
- Verificar se `updateConversationTags` ja faz update otimista em `allConversations`
- Se nao, adicionar

---

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/kanban/KanbanChatPanel.tsx` | Adicionar prop `updateClientStatusMutation`, usar mutacao compartilhada para status, adicionar invalidacao com delay para tags |
| `src/pages/Kanban.tsx` | Passar `updateClientStatus` do useConversations como prop |
| `src/hooks/useConversations.tsx` | Verificar/garantir update otimista em `updateConversationTags` |

## Resumo do Fluxo Corrigido

**Status:** Usuario clica "Qualificado" no painel -> `updateClientStatus` do `useConversations` (via prop) -> `onMutate` atualiza `allConversations` -> card muda instantaneamente -> Realtime confirma

**Tags:** Usuario clica tag no painel -> operacao no Supabase + invalidacao com delay -> board atualiza apos ~1s

## Risco
- **Muito baixo**: Mesma abordagem ja validada para departamentos e arquivamento
- **Retrocompativel**: Prop opcional com fallback
