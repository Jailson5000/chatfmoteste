
# Plano: Corrigir Edge Function delete-client

## Problema Identificado

A edge function `delete-client` falha com o erro:
```
Could not find the table 'public.tray_order_map' in the schema cache
```

**Causa:** O código tenta limpar registros de uma tabela `tray_order_map` que **não existe** no banco de dados.

## Tabelas Tray Existentes

| Tabela | Existe |
|--------|--------|
| `tray_chat_audit_logs` | ✅ |
| `tray_chat_integrations` | ✅ |
| `tray_customer_map` | ✅ |
| `tray_order_map` | ❌ NÃO EXISTE |

## Solução

Remover o bloco de código que tenta deletar da tabela inexistente `tray_order_map` (linhas 94-98):

### Antes (linhas 94-98):
```typescript
const { error: trayOrderMapError } = await supabase
  .from("tray_order_map")
  .delete()
  .in("local_conversation_id", conversationIds);
if (trayOrderMapError) throw trayOrderMapError;
```

### Depois:
Remover completamente esse bloco. Não é necessário substituir por nada pois a tabela não existe.

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/delete-client/index.ts` | Remover referência à tabela `tray_order_map` (linhas 94-98) |

## Impacto

- **Baixo risco:** A tabela não existe, então não há dados a limpar
- **Correção imediata:** Contatos poderão ser excluídos novamente

## Código Atualizado Completo

```typescript
if (conversationIds.length > 0) {
  console.log(`[delete-client] Detaching logs from ${conversationIds.length} conversations`);

  const { error: googleAiLogsConvError } = await supabase
    .from("google_calendar_ai_logs")
    .update({ conversation_id: null })
    .in("conversation_id", conversationIds);
  if (googleAiLogsConvError) throw googleAiLogsConvError;

  const { error: googleEventsConvError } = await supabase
    .from("google_calendar_events")
    .update({ conversation_id: null })
    .in("conversation_id", conversationIds);
  if (googleEventsConvError) throw googleEventsConvError;

  // REMOVIDO: tray_order_map não existe
}
```
