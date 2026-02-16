
# Correcao: "Expandir Conversa" do Kanban nao abre conversas antigas

## Problema Identificado

Quando voce clica em "Expandir conversa" no Kanban, o sistema navega para `/conversations?id={conversationId}`. A pagina de Conversas carrega apenas as **primeiras 30 conversas** (batch de paginacao). O codigo que processa o deep-link faz:

```text
conversations.find(c => c.id === idParam)
```

Se a conversa nao esta nessas 30 primeiras (porque e antiga ou esta em outro status/filtro), ela **nao e encontrada**, a selecao falha silenciosamente, e o parametro `?id=` e removido da URL. Resultado: o usuario cai na pagina de Conversas sem nenhuma conversa aberta.

## Solucao

Quando o `?id=` nao e encontrado no array local de conversas, fazer uma **busca direta no banco** por aquele ID especifico e injetar a conversa no estado local antes de seleciona-la.

## Mudancas Necessarias

### 1. `src/hooks/useConversations.tsx`
- Adicionar uma funcao `fetchSingleConversation(id)` que busca uma conversa especifica do banco via RPC ou query direta, usando a mesma estrutura de dados do batch normal.
- Exportar essa funcao para uso externo.

### 2. `src/pages/Conversations.tsx` (deep-link effect, ~linha 688)
- Alterar a logica do `if (idParam)`:
  - Se `conversations.find(...)` encontrar: comportamento atual (seleciona direto).
  - Se **nao encontrar**: chamar `fetchSingleConversation(idParam)`.
  - Se a busca retornar resultado: injetar no array de conversas via `setAllConversations`, selecionar e abrir.
  - Se nao retornar: exibir toast informando que a conversa nao foi encontrada.
  - Mover o `clearParams()` para **depois** da resolucao (dentro do `.then()`), nao antes.

### 3. Mudanca na tab ativa
- Ao encontrar a conversa via busca direta, definir `activeTab` para `"all"` (ou `"queue"`) para garantir que ela apareca na lista, independente do filtro ativo.

## Detalhes Tecnicos

A funcao `fetchSingleConversation` usara a mesma query do `fetchConversations` existente, mas com filtro `eq('id', conversationId)` em vez de paginacao. Isso garante que o objeto retornado tenha a mesma estrutura (joins com `last_message`, `assigned_profile`, `whatsapp_instance`, `client`, etc.).

## Risco

**Baixo**. A mudanca so afeta o fluxo de deep-link (`?id=`). O carregamento normal da lista nao e alterado. Nenhuma migration de banco necessaria.
