
# Correcao: Deep-link do Kanban falha ao abrir conversas

## Bugs Identificados

### Bug 1 (CRITICO): Chamada RPC desnecessaria aborta a funcao

Em `fetchSingleConversation` (useConversations.tsx, linhas 1209-1220), existe uma chamada RPC **completamente inutil** que:

1. Busca 1 conversa aleatoria do banco (sem filtrar pelo ID desejado)
2. Ignora o resultado retornado
3. **Se o RPC falhar por qualquer motivo, a funcao retorna `null` ANTES de tentar a busca direta real**

```text
fetchSingleConversation(id)
  |
  v
  RPC get_conversations_with_metadata (limit=1) -- INUTIL, resultado ignorado
  |
  +--> Se erro RPC --> return null  <-- ABORTA AQUI
  |
  v
  Query direta com .eq('id', conversationId)  -- Nunca chega se RPC falhou
```

Isso explica o toast "Conversa nao encontrada" - a funcao nem chega a buscar a conversa real.

### Bug 2: Guard condition impede execucao quando aba "Fila" esta vazia

Na linha 671 de Conversations.tsx:
```text
if (isLoading || !conversations.length) return;
```

Se o usuario cai na aba "Fila" que tem 0 conversas (como mostrado no screenshot), e o array `conversations` (filtrado por departamento) estiver vazio naquele instante, o effect nunca roda. O `?id=` fica na URL mas nada acontece.

---

## Correcoes

### 1. `src/hooks/useConversations.tsx` - Remover RPC inutil

Remover completamente as linhas 1209-1220 (a chamada RPC que busca 1 conversa aleatoria e pode abortar a funcao). Manter apenas a query direta que realmente busca pelo ID.

Antes:
```text
fetchSingleConversation(id)
  -> RPC (pode falhar e abortar)
  -> Query direta (pode nunca executar)
```

Depois:
```text
fetchSingleConversation(id)
  -> Query direta com .eq('id', conversationId)
```

### 2. `src/pages/Conversations.tsx` - Corrigir guard do deep-link

Mudar a guard condition para permitir que o deep-link rode mesmo quando nao ha conversas carregadas:

```text
Antes: if (isLoading || !conversations.length) return;
Depois: Separar: se tem idParam, so precisamos que isLoading seja false (nao depende de conversations carregadas). Para phone/name, manter o guard original.
```

---

## Risco

**Zero**. Estamos removendo codigo morto (RPC inutil) e relaxando uma guard condition para o caso especifico do deep-link. O fluxo normal de carregamento de conversas nao e afetado.
