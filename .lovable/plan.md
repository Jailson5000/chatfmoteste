

# Corrigir recebimento de mensagens do uazapi

## Problema Raiz (confirmado pelos logs)

Os logs mostram claramente o problema:

```
Event: unknown {"BaseUrl":"https://miauchat.uazapi.com","EventType":"messages","chat":{...}}
Unhandled event: unknown
```

O uazapi envia o tipo de evento no campo `EventType` (PascalCase), mas o codigo (linha 162) verifica apenas `body.event` e `body.type`:

```typescript
const event = body.event || body.type || "unknown";
```

Resultado: **todas as mensagens recebidas sao classificadas como "unknown"** e ignoradas.

Alem disso, ha um segundo problema: metade dos webhooks falham com "Invalid or missing token". O uazapi parece enviar multiplas chamadas por evento, e algumas nao incluem o token. As que passam a validacao de token sao processadas, mas caem no "unknown".

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**1. Corrigir deteccao do tipo de evento (linha 162):**

Adicionar `body.EventType` ao chain de deteccao:

```typescript
const event = body.event || body.type || body.EventType || "unknown";
```

**2. Normalizar os nomes de evento do uazapi:**

O uazapi envia `EventType: "messages"` que ja casa com o `case "messages"` existente (linha 295). Mas outros eventos podem ter nomes diferentes. Adicionar normalizacao:

```typescript
const rawEvent = body.event || body.type || body.EventType || "unknown";
const event = rawEvent.toLowerCase(); // normalizar para minusculas
```

E ajustar os cases do switch para incluir variantes em minusculas (os cases atuais ja cobrem `"messages"`, `"message"`, `"connection"`, etc.).

**3. Melhorar deteccao da instancia pelo payload uazapi:**

Os logs mostram que o payload uazapi inclui `BaseUrl` e informacoes do chat. Quando o token nao e encontrado no payload, podemos tentar encontrar a instancia pela `api_url`:

```typescript
if (!instance && body.BaseUrl) {
  const { data } = await supabaseClient
    .from("whatsapp_instances")
    .select("*")
    .eq("api_provider", "uazapi")
    .ilike("api_url", `%${new URL(body.BaseUrl).hostname}%`)
    .limit(1)
    .maybeSingle();
  instance = data;
}
```

## Resumo das Alteracoes

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | 1. Adicionar `body.EventType` na deteccao de evento |
| | 2. Normalizar evento para lowercase |
| | 3. Adicionar fallback de identificacao de instancia por `BaseUrl` |

## Resultado Esperado

Mensagens recebidas do WhatsApp via uazapi serao corretamente identificadas como evento `"messages"`, processadas, salvas no banco e exibidas na interface de conversas em tempo real.

