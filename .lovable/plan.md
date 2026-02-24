

# Corrigir auto-deteccao do numero da instancia Uazapi

## Problema

A instancia "Miauz" (`inst_xcehi4b8`) esta conectada mas `phone_number` continua null. Motivo:

1. O auto-fetch via `/instance/status` so roda quando chega um **evento de conexao** (`case "connection"`). Como a instancia ja estava conectada quando o codigo foi deployado, esse evento nunca disparou.
2. Cada mensagem recebida traz `chat.owner = "556399540484"` -- esse e o numero da propria instancia. Mas o webhook nao usa esse campo para preencher `phone_number`.

## Solucao

**Arquivo:** `supabase/functions/uazapi-webhook/index.ts`

No bloco de processamento de mensagens (case "messages"), logo apos extrair o `chat` object (~linha 458), adicionar logica para preencher `phone_number` automaticamente quando ainda estiver null:

```typescript
// Auto-populate instance phone_number from chat.owner if missing
const chatOwner = chat.owner || chat.wa_owner || "";
if (chatOwner && !instance.phone_number) {
  const ownerPhone = extractPhone(chatOwner);
  if (ownerPhone && ownerPhone.length >= 10) {
    console.log("[UAZAPI_WEBHOOK] Auto-populating phone from chat.owner:", ownerPhone);
    await supabaseClient
      .from("whatsapp_instances")
      .update({ phone_number: ownerPhone, updated_at: new Date().toISOString() })
      .eq("id", instance.id);
    // Update local reference to avoid re-running
    (instance as any).phone_number = ownerPhone;
  }
}
```

Isso roda na **primeira mensagem recebida** apos deploy e preenche o numero permanentemente. Impacto zero em performance -- e uma unica query extra apenas quando `phone_number` e null.

## Resultado

- Na proxima mensagem recebida pela instancia "Miauz", `phone_number` sera preenchido com `556399540484`
- O card de conversa passara a exibir `**0484`
- A pagina de conexoes mostrara o numero formatado

## Arquivos alterados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Adicionar auto-populate de `phone_number` via `chat.owner` no handler de mensagens |

