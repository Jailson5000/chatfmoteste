
# Corrigir Kanban: Atualizacoes Visuais Atrasadas com Muitas Conversas

## Causa Raiz Identificada

O problema esta na **corrida entre atualizacao otimista e refetch do banco**. Veja o que acontece passo a passo:

```text
1. Usuario arrasta conversa para novo departamento
2. onMutate: atualiza allConversations otimisticamente (UI muda INSTANTANEAMENTE)
3. mutationFn: executa 4-5 queries no banco (busca dept atual, novo dept, update, log)
4. onSettled: chama invalidateQueries(["conversations"])
5. Refetch: executa get_conversations_with_metadata (APENAS os primeiros 30)
6. useEffect sync: SOBRESCREVE allConversations com dados "frescos" do refetch
7. Realtime: 300ms depois, OUTRA invalidacao chega via RealtimeSyncContext
8. RESULTADO: dados antigos do refetch REVERTEM a atualizacao otimista
```

O problema piora com muitas conversas porque:
- A RPC `get_conversations_with_metadata` fica mais lenta (mais dados para processar)
- O Kanban carrega TODAS as conversas (auto-load loop nas linhas 83-87)
- Cada refetch retorna apenas 30 conversas, mas o `useEffect` de sync (linhas 162-204) substitui as correspondentes com dados "frescos" -- que podem estar DESATUALIZADOS por causa da latencia do banco

## Solucao Proposta

### Mudanca 1: Proteger atualizacoes otimistas contra refetch prematuro

Adicionar um mecanismo de "mutation lock" no `useConversations.tsx`. Enquanto houver mutations ativas, o `useEffect` de sync nao sobrescreve os campos que foram modificados otimisticamente.

**Arquivo: `src/hooks/useConversations.tsx`**

- Criar um `ref` chamado `pendingOptimisticUpdates` (Map de conversationId para campos atualizados)
- No `onMutate`: registrar quais campos foram atualizados otimisticamente
- No `onSettled`: remover o registro apos um delay de 2 segundos (tempo para o banco propagar)
- No `useEffect` de sync (linhas 162-204): ao fazer merge, preservar campos que estao em `pendingOptimisticUpdates`

### Mudanca 2: Eliminar invalidacoes duplicadas

Atualmente, cada mutation chama `invalidateQueries` no `onSuccess` ou `onSettled`, E o Realtime tambem dispara invalidacao 300ms depois. Isso causa 2 refetches para cada acao.

**Arquivo: `src/hooks/useConversations.tsx`**

- Remover `invalidateQueries` do `onSuccess` de `updateConversation` (ja faz no `onSettled` via Realtime)
- Mover `invalidateQueries` do `onSettled` de `updateConversationDepartment` para `onSuccess` com um `setTimeout` de 1 segundo (dar tempo ao banco para propagar)

### Mudanca 3: Atualizar departamento no objeto local (incluindo nome e cor)

O `onMutate` de `updateConversationDepartment` atualiza apenas `department_id`, mas o Kanban usa `conv.department` (objeto com id, name, color) para renderizar. Isso causa dessincronia visual.

**Arquivo: `src/hooks/useConversations.tsx`**

- No `onMutate` de `updateConversationDepartment`: tambem atualizar o campo `department` (objeto completo) usando dados dos departments ja carregados
- Isso requer passar os departments como parametro ou buscar do cache do queryClient

### Mudanca 4: Evitar refetch parcial que sobrescreve dados carregados

O `useQuery` refetch retorna apenas 30 conversas (offset 0). Se a conversa movida esta na posicao 31+, ela nao e atualizada pelo refetch, mas tambem nao e revertida. Porem se esta nas primeiras 30, os dados antigos do banco (que ainda nao propagou) revertem o otimista.

**Arquivo: `src/hooks/useConversations.tsx`**

- No `useEffect` de sync: adicionar verificacao de timestamp. So substituir uma conversa local se o dado do refetch for mais recente que a ultima atualizacao otimista

---

## Detalhes Tecnicos

### pendingOptimisticUpdates (novo ref)

```text
Tipo: Map<string, { fields: Record<string, any>, timestamp: number }>

Fluxo:
  onMutate  -> pendingOptimisticUpdates.set(convId, { fields: { department_id }, timestamp: Date.now() })
  sync effect -> ao fazer merge, se convId esta no Map e timestamp < 2s, preservar os fields listados
  onSettled -> setTimeout(2000, () => pendingOptimisticUpdates.delete(convId))
```

### Impacto nas Mutations Existentes

| Mutation | Mudanca |
|----------|---------|
| `updateConversation` | Adicionar registro em pendingOptimisticUpdates no onMutate. Remover invalidateQueries do onSuccess (Realtime ja cobre) |
| `updateConversationDepartment` | Adicionar department object no onMutate. Registrar em pendingOptimisticUpdates. Delay no invalidate |
| `updateConversationStatus` | Sem mudanca (nao tem onMutate otimista) |
| `transferHandler` | Ja tem onMutate correto, adicionar registro em pendingOptimisticUpdates |

### Risco

| Aspecto | Avaliacao |
|---------|-----------|
| Risco de quebra | **Baixo** - so muda quando o merge acontece, nao a logica de negocio |
| Impacto se falhar | Comportamento atual (precisa de F5) - nao piora |
| Teste necessario | Mover conversas entre departamentos, arquivar, transferir handler com 50+ conversas carregadas |

### Arquivos Modificados

1. `src/hooks/useConversations.tsx` - mecanismo de protecao otimista + limpeza de invalidacoes duplicadas
