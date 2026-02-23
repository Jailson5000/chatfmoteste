
# Corrigir: "Invalid integration" ao Recriar Instancias

## Problema Identificado

O erro dos logs e claro:
```
Failed to recreate instance: {"status":400,"error":"Bad Request","response":{"message":["Invalid integration"]}}
```

A Evolution API v2.3+ **exige** o campo `integration: "WHATSAPP-BAILEYS"` no payload de criacao de instancias. O codigo original de `create_instance` (linha 613) inclui esse campo corretamente, mas **4 locais de recriacao** nao incluem, causando erro 400.

## Locais com o Bug

| Local | Linha | integration | webhook | Status |
|---|---|---|---|---|
| `create_instance` (original) | 610-615 | Presente | Presente | OK |
| `global_create_instance` | 3303-3308 | Presente | Presente | OK |
| Recreate no `get_qrcode` (404) | 740-744 | **FALTANDO** | **FALTANDO** | BUG |
| Recreate no `get_qrcode` (corrupted) | 869-873 | **FALTANDO** | **FALTANDO** | BUG |
| Recreate no `reconnect` | 1711-1715 | **FALTANDO** | **FALTANDO** | BUG |
| Recreate no `auto-reconnect` | 148-152 | **FALTANDO** | **FALTANDO** | BUG |

## Correcao

Adicionar `integration: "WHATSAPP-BAILEYS"` e `webhook: buildWebhookConfig(WEBHOOK_URL)` nos 4 locais que estao faltando.

### Arquivo 1: `supabase/functions/evolution-api/index.ts`

**Local 1 - Linha 740** (recreate no get_qrcode quando 404):
```typescript
// DE:
body: JSON.stringify({
  instanceName: instance.instance_name,
  token: instance.api_key,
  qrcode: true,
}),

// PARA:
body: JSON.stringify({
  instanceName: instance.instance_name,
  token: instance.api_key,
  qrcode: true,
  integration: "WHATSAPP-BAILEYS",
  webhook: buildWebhookConfig(WEBHOOK_URL),
}),
```

**Local 2 - Linha 869** (recreate no get_qrcode quando sessao corrompida):
```typescript
// Mesmo padrao: adicionar integration e webhook
```

**Local 3 - Linha 1711** (recreate no reconnect):
```typescript
// Mesmo padrao: adicionar integration e webhook
```

### Arquivo 2: `supabase/functions/auto-reconnect-instances/index.ts`

**Local 4 - Linha 148** (recreate no auto-reconnect):
```typescript
// DE:
body: JSON.stringify({
  instanceName: instance.instance_name,
  token: instance.api_key,
  qrcode: true,
}),

// PARA:
body: JSON.stringify({
  instanceName: instance.instance_name,
  token: instance.api_key,
  qrcode: true,
  integration: "WHATSAPP-BAILEYS",
  webhook: buildWebhookConfig(WEBHOOK_URL),
}),
```

Nota: O `auto-reconnect` ja tem a variavel `WEBHOOK_URL` e a funcao `buildWebhookConfig` disponiveis.

## Impacto

| Antes | Depois |
|---|---|
| Toda recriacao falha com "Invalid integration" | Recriacao funciona com payload correto |
| QR Code nunca aparece | QR Code gerado na recriacao |
| Sessoes corrompidas ficam presas | Sessoes recriadas automaticamente |

## Arquivos Editados

1. `supabase/functions/evolution-api/index.ts` - Adicionar `integration` e `webhook` em 3 locais de recriacao
2. `supabase/functions/auto-reconnect-instances/index.ts` - Adicionar `integration` e `webhook` em 1 local de recriacao
