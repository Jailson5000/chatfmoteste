

# Corrigir Webhook do WhatsApp - Eventos Nao Registrados

## Problema Identificado

A funcao `buildWebhookConfig` no arquivo `supabase/functions/evolution-api/index.ts` (linha 179) usa chaves em **snake_case**:

```text
webhook_by_events: false
webhook_base64: true
```

Porem, a Evolution API v2.2.3 espera **camelCase**:

```text
webhookByEvents: false
webhookBase64: true
```

Como resultado, a API ignora essas propriedades. O webhook URL e registrado, mas a lista de eventos nao e aplicada corretamente. Por isso:
- Eventos `CONTACTS_UPDATE` chegam (comportamento default da API)
- Eventos `MESSAGES_UPSERT` NAO chegam (nao foram registrados)

## Evidencia

1. Logs do `evolution-webhook`: 100% dos eventos sao `CONTACTS_UPDATE`, zero `MESSAGES_UPSERT`
2. Resposta da criacao da instancia: `"webhook":{"webhookUrl":"..."}` -- sem lista de eventos

## Correcao

### Arquivo: `supabase/functions/evolution-api/index.ts`

Alterar a funcao `buildWebhookConfig` (linhas 179-194) de:

```typescript
function buildWebhookConfig(webhookUrl: string) {
  return {
    enabled: true,
    url: webhookUrl,
    webhook_by_events: false,
    webhook_base64: true,
    events: [
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_DELETE",
      "CONTACTS_UPDATE",
    ],
  };
}
```

Para:

```typescript
function buildWebhookConfig(webhookUrl: string) {
  return {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: true,
    events: [
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_DELETE",
      "CONTACTS_UPDATE",
    ],
  };
}
```

Apenas 2 propriedades mudam:
- `webhook_by_events` -> `webhookByEvents`
- `webhook_base64` -> `webhookBase64`

### Pos-deploy

Apos o deploy automatico da Edge Function, sera necessario executar no VPS o comando de reaplicar webhook nas instancias conectadas:

```bash
curl -s -X POST \
  -H "apikey: a3c56030f89efe1e5b4c033308c7e3c8f72d7492ac8bb46947be28df2e06ffed" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://jiragtersejnarxruqyd.supabase.co/functions/v1/evolution-webhook?token=19a165ec02bee752a7440f6dafd28638604308d7abd31135acbb8941ad6b2ad7",
      "webhookByEvents": false,
      "webhookBase64": true,
      "events": ["CONNECTION_UPDATE","QRCODE_UPDATED","MESSAGES_UPSERT","MESSAGES_DELETE","CONTACTS_UPDATE"]
    }
  }' \
  https://evo.fmoadv.com.br/webhook/set/inst_7jg7taxw
```

Repetir para `inst_eqblozqc` (trocar o nome da instancia no final da URL).

Alternativamente, clicar em "Reaplicar Webhooks" no Painel Admin Global apos o deploy.

## Impacto

- Correcao minima: apenas 2 linhas mudam
- Nenhuma outra funcionalidade e afetada
- Apos reaplicar webhooks, as mensagens recebidas no WhatsApp devem aparecer imediatamente no sistema
