

# Correcao: Templates/Midias da IA Nao Chegam ao Cliente (uazapi)

## Diagnostico

A funcao `executeTemplateTool` dentro de `ai-chat/index.ts` e responsavel por enviar templates (texto, imagens, documentos, links) diretamente ao WhatsApp quando a IA decide usar a tool `send_template`.

**Problema confirmado:** Essa funcao usa EXCLUSIVAMENTE endpoints da Evolution API:
- Texto: `POST {apiUrl}/message/sendText/{instance_name}` com header `apikey`
- Media: `POST {apiUrl}/message/sendMedia/{instance_name}` com header `apikey`

A instancia FMOANTIGO usa **uazapi**, que tem endpoints completamente diferentes:
- Texto: `POST {apiUrl}/send/text` com header `token`
- Media: `POST {apiUrl}/send/media` com header `token`

**Resultado:** O `fetch` para `/message/sendText/...` retorna 404 ou erro na API uazapi. A mensagem e salva no banco (aparece no chat da plataforma) mas NUNCA chega ao WhatsApp do cliente. Os logs mostrariam "Failed to send template text to WhatsApp" mas o sistema continua sem falha visivel.

Alem disso, a query de instancia (linha 2275) NAO busca `api_provider`, entao a funcao nem sabe qual provedor usar.

## Correcao Proposta

### Arquivo: `supabase/functions/ai-chat/index.ts`

**Mudanca A — Buscar `api_provider` da instancia (CRITICO):**

Na linha 2275, adicionar `api_provider` ao SELECT:
```typescript
.select("api_url, api_key, instance_name, status, api_provider")
```

**Mudanca B — Roteamento de envio de texto por provedor (CRITICO):**

Na linha 2286-2305, substituir o envio de texto para suportar ambos os provedores:

```text
const isUazapi = instance.api_provider === 'uazapi';

// TEXTO
if (isUazapi) {
  // uazapi: POST /send/text com header token
  fetch(`${apiUrl}/send/text`, {
    headers: { "Content-Type": "application/json", token: instance.api_key },
    body: JSON.stringify({ number: targetNumber, text: finalContent })
  })
} else {
  // Evolution: POST /message/sendText/{name} com header apikey
  fetch(`${apiUrl}/message/sendText/${instance.instance_name}`, {
    headers: { "Content-Type": "application/json", apikey: instance.api_key },
    body: JSON.stringify({ number: targetNumber, text: finalContent })
  })
}
```

**Mudanca C — Roteamento de envio de midia por provedor (CRITICO):**

Na linha 2308-2380, substituir o envio de midia:

```text
if (isUazapi) {
  // uazapi: POST /send/media com header token e campo "file"
  fetch(`${apiUrl}/send/media`, {
    headers: { "Content-Type": "application/json", token: instance.api_key },
    body: JSON.stringify({ number: targetNumber, file: finalMediaUrl })
  })
} else {
  // Evolution: POST /message/sendMedia/{name} com header apikey (logica atual mantida)
  // ... mediaPayload com mediatype, mimetype, media ...
}
```

Para uazapi, o endpoint `/send/media` aceita `{ number, file }` onde `file` pode ser URL, simplificando muito o envio.

## Resumo

| Arquivo | Mudanca | Prioridade |
|---|---|---|
| `ai-chat/index.ts` | Buscar `api_provider` no SELECT da instancia | CRITICO |
| `ai-chat/index.ts` | Roteamento de texto: uazapi (`/send/text` + `token`) vs Evolution (`/message/sendText` + `apikey`) | CRITICO |
| `ai-chat/index.ts` | Roteamento de midia: uazapi (`/send/media` + `file`) vs Evolution (`/message/sendMedia` + `media`) | CRITICO |

## Resultado Esperado

- Templates com texto, imagens, links e documentos chegam ao cliente no WhatsApp via uazapi
- Compatibilidade mantida com Evolution API para instancias que a usem
- Mensagens continuam salvas no banco para exibicao na plataforma

