

# Corrigir Som de Transferencia de Conversas

## Problema

A logica de supressao de som (linha 88) depende de comparar valores **anteriores** da conversa (`oldRecord.assigned_to` e `oldRecord.current_handler`). Porem, a tabela `conversations` usa replica identity padrao, o que faz o Supabase Realtime enviar apenas o `id` no campo `old`. Todos os outros campos vem como `undefined`.

Resultado atual:
- `!oldRecord.assigned_to` = `!undefined` = `true`
- `oldRecord.current_handler !== 'ai'` = `undefined !== 'ai'` = `true`
- A condicao SEMPRE retorna, bloqueando **todos** os sons de transferencia

## Solucao

Uma unica migracao SQL para alterar a replica identity da tabela `conversations` para FULL:

```text
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
```

Isso faz o Realtime enviar **todos os campos anteriores** no `old`, permitindo que a logica existente funcione corretamente.

**Nenhuma mudanca em codigo TypeScript** -- a logica no `useMessageNotifications.tsx` ja esta correta, so precisa dos dados corretos do Realtime.

## O que muda

| Antes (replica default) | Depois (replica FULL) |
|------------------------|-----------------------|
| `oldRecord.assigned_to` = undefined | `oldRecord.assigned_to` = valor real (null, ou ID do usuario anterior) |
| `oldRecord.current_handler` = undefined | `oldRecord.current_handler` = valor real ('ai', 'human', etc.) |
| Supressao bloqueia TODOS os sons | Supressao so bloqueia auto-atribuicao da fila |

## Cenarios apos a correcao

| Cenario | old.assigned_to | old.current_handler | Som? |
|---------|----------------|---------------------|------|
| Atendente envia mensagem (auto-atribui da fila) | null | human | Nao |
| IA transfere para Atendente A | null | ai | Sim |
| Atendente B transfere para Atendente A | ID do B | human | Sim |
| Update sem mudar assigned_to | qualquer | qualquer | Nao (valores iguais) |

## Impacto

- **Risco**: Muito baixo -- REPLICA IDENTITY FULL e pratica recomendada pelo Supabase para tabelas com logica Realtime condicional
- **Performance**: Eventos Realtime ficam levemente maiores (enviam todos os campos no `old`), mas isso e insignificante para a tabela `conversations`
- **Codigo existente**: Nenhuma alteracao. A logica atual ja esta preparada para funcionar com os dados corretos
- **Arquivo modificado**: Nenhum arquivo TypeScript -- apenas uma migracao SQL

