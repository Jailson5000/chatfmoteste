

# Corrigir "Total de Conversas" no Dashboard

## Problema

O campo "Total de Conversas" mostra 83, mas deveria mostrar o numero real de conversas. O valor atual e calculado contando apenas conversas que tiveram mensagens no periodo selecionado (`uniqueConversations` derivado da tabela `messages`). Isso exclui conversas que existem mas nao tiveram mensagens no periodo.

Enquanto isso, "Conversas Ativas" mostra 382 corretamente (todas as conversas nao arquivadas).

## Causa

No arquivo `src/hooks/useDashboardMetrics.tsx`, o campo `totalConversations` e calculado assim:

```typescript
const uniqueConversations = new Set(messages?.map(m => m.conversation_id) || []).size;
```

Isso conta apenas conversas com mensagens no periodo, nao o total real.

## Solucao

Alterar o calculo de `totalConversations` para contar conversas diretamente da tabela `conversations`, usando a data de criacao ou ultima mensagem como filtro de periodo.

### Arquivo: `src/hooks/useDashboardMetrics.tsx`

1. Adicionar uma query direta a tabela `conversations` com filtro de data no campo `created_at` (conversas criadas no periodo) ou `last_message_at` (conversas com atividade no periodo)
2. Usar `count: "exact"` para eficiencia
3. Aplicar os mesmos filtros de atendente, departamento e conexao

O campo "Total de Conversas" passara a mostrar o total de conversas que tiveram atividade (last_message_at) no periodo, incluindo aquelas cujas mensagens individuais podem nao ter sido carregadas.

### Detalhes tecnicos

Na funcao `queryFn` do `dashboard-message-metrics`:

- Antes de buscar mensagens, fazer um `SELECT count(*)` em `conversations` com filtro `last_message_at` dentro do range de datas
- Substituir `uniqueConversations` pelo resultado dessa contagem
- Manter os demais calculos (received, sent, avgResponseTime) inalterados

Isso resolve o problema do limite de 1000 linhas do Supabase que pode estar truncando a contagem de mensagens, e mostra o numero real de conversas com atividade no periodo.

