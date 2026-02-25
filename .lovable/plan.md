

# Correção: Nome do cliente sendo sobrescrito a cada mensagem

## Diagnóstico

O `uazapi-webhook` sobrescreve o `contact_name` da conversa **a cada mensagem recebida** (linha 1193-1194):

```text
if (!isFromMe && contactName) {
  convUpdate.contact_name = contactName;  // ← Sobrescreve SEMPRE
}
```

Já o `evolution-webhook` tem proteção correta (linha 5780):

```text
const shouldUpdateContactName = !isFromMe 
  && !conversation.client_id    // ← Só atualiza se NÃO tem cliente vinculado
  && extractedContactName !== phoneNumber;  // ← Só se for nome real
```

Ou seja: no `evolution-webhook`, quando o cliente já está vinculado à conversa (tem `client_id`), o nome da conversa **não é mais sobrescrito** — preservando edições manuais. No `uazapi-webhook`, essa proteção não existe.

Além disso, o `evolution-webhook` só atualiza o nome do **cliente** (`clients.name`) quando ele ainda é igual ao número de telefone ou é `null` (linhas 6192-6211). Isso também protege edições manuais.

## Correção

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Linha 1193-1194** — Aplicar a mesma lógica de proteção do evolution-webhook:

Antes:
```typescript
if (!isFromMe && contactName) {
  convUpdate.contact_name = contactName;
}
```

Depois:
```typescript
// Only update contact_name if:
// 1. Message is from client (not from us)
// 2. Conversation does NOT have a linked client (client_id is null)
// 3. We found a valid name (not just the phone number)
// This protects manual name edits made by users
const shouldUpdateContactName = !isFromMe && !resolvedClientId && contactName && contactName !== phoneNumber;
if (shouldUpdateContactName) {
  convUpdate.contact_name = contactName;
}
```

Usa `resolvedClientId` (que é preenchido quando a conversa já tem um cliente vinculado) como proxy para `client_id`. Quando há cliente vinculado, o nome autoritativo vem da tabela `clients`, não do `pushName` do WhatsApp.

## Resultado

- Nomes editados manualmente no sistema serão preservados
- Nomes só serão preenchidos automaticamente para conversas novas sem cliente vinculado
- Alinha o comportamento do `uazapi-webhook` com o `evolution-webhook`

## Resumo

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Proteger `contact_name` contra sobrescrita quando já há cliente vinculado |

