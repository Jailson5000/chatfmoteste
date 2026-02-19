

# Remover MESSAGES_UPDATE do Webhook da Evolution API

## Alteracao

Remover a linha `"MESSAGES_UPDATE",` do array `events` na funcao `buildWebhookConfig` em `supabase/functions/evolution-api/index.ts` (linha 188).

### Antes (linhas 184-191):
```text
events: [
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",    <-- remover
  "MESSAGES_DELETE",
  "CONTACTS_UPDATE",
],
```

### Depois:
```text
events: [
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_DELETE",
  "CONTACTS_UPDATE",
],
```

## Seguranca

- O frontend ja assume "delivered" (2 tiques) apos 2 segundos via fallback automatico
- Erros de envio continuam sendo detectados no retorno do POST
- Instagram/Facebook nao sao afetados (usam meta-webhook)
- MESSAGES_DELETE permanece ativo

## Acao pos-deploy

Reaplicar webhooks em todas as instancias ativas pelo painel admin global para que a Evolution API pare de enviar o evento removido.

## Economia estimada

~25-30% menos invocacoes da Edge Function evolution-webhook.

