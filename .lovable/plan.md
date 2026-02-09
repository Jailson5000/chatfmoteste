
# Correção: Erro ao Apagar Mensagens

## Problema

O erro exato é:
```
Conversation not found: Could not embed because more than one relationship was found for 'conversations' and 'whatsapp_instances'
```

## Causa Raiz

**Arquivo:** `supabase/functions/evolution-api/index.ts` - Linha 3525

A tabela `conversations` tem **duas** chaves estrangeiras para `whatsapp_instances`:
1. `whatsapp_instance_id` (instância atual)
2. `last_whatsapp_instance_id` (instância anterior)

O código de apagar mensagem usa uma referência ambígua:
```javascript
.select("*, whatsapp_instances!inner(*)")
```

O PostgREST não sabe qual das duas FKs usar e retorna erro.

## Solução

Especificar a FK correta, exatamente como já é feito na ação `send_reaction` (linha 3616):

| Linha | Código Atual (Bug) | Codigo Correto |
|-------|-------------------|----------------|
| 3525 | `whatsapp_instances!inner(*)` | `whatsapp_instances!conversations_whatsapp_instance_id_fkey(*)` |

### Arquivo a Alterar

`supabase/functions/evolution-api/index.ts` - Linha 3525

```javascript
// DE:
.select("*, whatsapp_instances!inner(*)")

// PARA:
.select("*, whatsapp_instances!conversations_whatsapp_instance_id_fkey(*)")
```

## Sobre Edição de Mensagens

A Evolution API suporta edição de mensagens do WhatsApp apenas em versões mais recentes, e com limitações (apenas mensagens de texto, dentro de um prazo). Por ora, a prioridade é corrigir o apagar que já existe. Podemos adicionar edição como uma melhoria futura se desejado.

## Impacto

- Risco: Baixo - apenas corrige a referência da FK (mesmo padrão já usado em `send_reaction`)
- Deploy: Edge Function `evolution-api`
- Retrocompatibilidade: Total
