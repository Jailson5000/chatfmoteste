

# Arquivamento de Mensagens com mais de 90 Dias

## Resumo

Mover mensagens com mais de 90 dias da tabela `messages` para uma tabela `messages_archive`. O sistema continua funcionando normalmente porque todas as queries do dia a dia trabalham com mensagens recentes. Quando o usuario rolar o historico ate o fim, o frontend busca automaticamente do arquivo.

## Analise de Impacto -- O que NAO quebra

Analisei todos os pontos do codigo que leem da tabela `messages`:

| Componente | Como usa | Impacto |
|-----------|---------|--------|
| `useMessagesWithPagination` | Busca mensagens por `conversation_id`, paginadas do mais recente para o mais antigo | **Unico que precisa de ajuste** -- adicionar fallback para `messages_archive` no `loadMore` |
| `useDashboardMetrics` | Filtra por `created_at` com `gte`/`lte` (periodo selecionado, geralmente 7-30 dias) | **Nenhum impacto** -- nunca busca mensagens de 90+ dias |
| `generate-summary` | `LIMIT 100` mensagens mais recentes | **Nenhum impacto** |
| `extract-client-facts` | `LIMIT 50` mensagens mais recentes | **Nenhum impacto** |
| `KanbanChatPanel` | Insere/atualiza mensagens (star, reaction, notes) | **Nenhum impacto** -- opera sobre mensagens recentes |
| `evolution-webhook` | Insere novas mensagens | **Nenhum impacto** |
| `get_conversations_with_metadata` | Busca `last_message` (subquery `ORDER BY created_at DESC LIMIT 1`) | **Risco minimo** -- so afeta conversas inativas ha 90+ dias, onde o preview ficaria vazio |
| `resolveReplyTo` (realtime) | Busca `reply_to_message_id` na tabela `messages` | **Risco baixo** -- se a mensagem original foi arquivada, a resposta aparece sem preview (ja funciona assim hoje com `reply_to: null`) |
| `mark_messages_as_read` | Atualiza `read_at` de mensagens nao lidas | **Nenhum impacto** -- mensagens de 90+ dias ja foram lidas |
| `useSystemMetrics` (Global Admin) | `count` total de mensagens | **Mudanca cosmetica** -- contagem diminui, mas podemos somar com archive |

## Implementacao

### 1. Migration SQL

**Criar tabela `messages_archive`** com a mesma estrutura da `messages`, mais um campo `archived_at`. Indices otimizados para consultas por `conversation_id` + `created_at`. RLS identica a `messages` (isolamento por `law_firm_id`).

**Criar funcao `archive_old_messages()`**:
- Processa em batches de 5.000 registros
- Usa `FOR UPDATE SKIP LOCKED` para nao travar outras queries
- `pg_sleep(0.1)` entre batches para nao sobrecarregar
- Mensagens com `is_starred = true` NAO sao arquivadas
- Antes de mover, desvincula `reply_to_message_id` de mensagens que apontam para as que serao arquivadas (evita FK violation)
- Registra resultado em `system_settings` para monitoramento

**Criar cron job**: domingos as 4h da manha

### 2. Frontend -- `useMessagesWithPagination.tsx`

Unica alteracao no frontend. No `loadMore`, quando a query retorna 0 resultados da tabela `messages` mas o usuario esta rolando para cima:

```text
1. loadMore() busca da tabela "messages"
2. Se retorna 0 resultados:
   a. Busca da tabela "messages_archive" com mesmos filtros
   b. Se encontra mensagens, adiciona ao estado normalmente
   c. Se nao encontra, marca hasMoreMessages = false
3. UX permanece identica -- usuario nem percebe a diferenca
```

A tipagem `messages_archive` sera automaticamente gerada no `types.ts` pela migration, entao o Supabase client aceita `.from("messages_archive")` sem erros de tipo.

### 3. (Opcional) `resolveReplyTo` -- fallback para archive

Quando uma mensagem recente responde a uma mensagem que foi arquivada, a busca na tabela `messages` retorna vazio. Podemos adicionar um fallback:

```text
1. Busca em "messages" (como hoje)
2. Se nao encontra, busca em "messages_archive"
3. Se nao encontra, retorna reply_to: null (como hoje)
```

Isso e uma melhoria, nao e obrigatorio. Sem ele, o comportamento atual ja e seguro (mostra a mensagem sem o preview da resposta).

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|--------------|---------|----------|
| Preview de `last_message` vazio em conversas inativas | Baixa | Cosmetico | So afeta conversas sem atividade por 90+ dias. Podem ser ignoradas ou receber fallback para archive |
| `reply_to` aponta para mensagem arquivada | Baixa | Cosmetico | A mensagem aparece sem "em resposta a..." -- mesmo comportamento de quando a mensagem original nao e encontrada |
| Job de arquivamento causa lentidao | Muito baixa | Temporario | Batches de 5.000 com `SKIP LOCKED` e pausa de 100ms. Roda domingo 4h da manha (menor uso) |
| Contagem total de mensagens no Global Admin diminui | Certa | Cosmetico | Podemos somar `messages` + `messages_archive` na query do `useSystemMetrics` |
| `is_starred` mensagens sao arquivadas por engano | Zero | -- | Filtro explicito `is_starred = false` na query de arquivamento |

## Como Reverter

Se algo der errado, reverter e simples:

```sql
-- Mover tudo de volta (sem archived_at)
INSERT INTO messages (id, conversation_id, sender_type, ...)
SELECT id, conversation_id, sender_type, ...
FROM messages_archive;

-- Limpar
DELETE FROM messages_archive;

-- Desativar cron
SELECT cron.unschedule('archive-old-messages-weekly');
```

## Arquivos Alterados

| Arquivo | Tipo de Alteracao |
|---------|-----------------|
| Migration SQL (novo) | Criar tabela, funcao, cron job, indices, RLS |
| `src/hooks/useMessagesWithPagination.tsx` | Adicionar fallback para `messages_archive` no `loadMore` (~20 linhas) |
| (Opcional) `src/hooks/useMessagesWithPagination.tsx` | Fallback no `resolveReplyTo` para buscar no archive (~5 linhas) |

Nenhuma outra parte do sistema precisa ser alterada.

