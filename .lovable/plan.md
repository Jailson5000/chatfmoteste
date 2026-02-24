

# Puxar numero do WhatsApp automaticamente e exibir ultimos 4 digitos no card

## Diagnostico

A instancia "Miauz" (uazapi) esta com `phone_number: null` no banco, mesmo estando conectada. Isso acontece porque:

1. O webhook de conexao do uazapi (`case "connection"`) tenta extrair o telefone de `body.phone`, `body.number` ou `body.ownerJid`, mas o uazapi nao envia esses campos no evento de conexao -- envia apenas `state: "connected"`.
2. O `fetch_phone` (que chama `GET /instance/status` no uazapi e retorna o numero correto) so e disparado manualmente pelo botao de refresh.
3. Sem `phone_number`, o card de conversa mostra "Miauz" (fallback do nome da instancia) em vez de `•••0484`.

## Solucao

### 1. Auto-fetch do numero apos conexao no webhook

**Arquivo:** `supabase/functions/uazapi-webhook/index.ts` (linhas 379-388)

Quando `dbStatus === "connected"` e nao houver `phone` no payload E a instancia ainda nao tiver `phone_number`, chamar o endpoint `/instance/status` do uazapi para buscar o numero automaticamente:

```typescript
if (dbStatus === "connected") {
  updatePayload.disconnected_since = null;
  updatePayload.awaiting_qr = false;
  updatePayload.reconnect_attempts_count = 0;
  updatePayload.manual_disconnect = false;

  let phone = body.phone || body.number || body.ownerJid?.split("@")[0] || null;
  
  // Se nao veio no payload e instancia nao tem numero, buscar via API
  if (!phone && !instance.phone_number) {
    try {
      const statusRes = await fetch(`${normalizeUrl(instance.api_url)}/instance/status`, {
        method: "GET",
        headers: { token: instance.api_key, "Content-Type": "application/json" },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        phone = statusData?.phone || statusData?.number || statusData?.ownerJid?.split("@")[0] || null;
        console.log("[UAZAPI_WEBHOOK] Auto-fetched phone from status:", phone);
      }
    } catch (e) {
      console.warn("[UAZAPI_WEBHOOK] Failed to auto-fetch phone:", e);
    }
  }
  
  if (phone) {
    updatePayload.phone_number = extractPhone(phone);
  }
}
```

**Impacto:** Baixo. E uma chamada HTTP extra apenas quando a instancia conecta pela primeira vez (quando `phone_number` ainda e null). Nao afeta performance do webhook normal de mensagens.

### 2. Card de conversas -- ja funciona

O `ConversationSidebarCard` ja tem a logica correta em `getConnectionInfo()` (linhas 109-118):
- Se `whatsappPhone` tem 4+ digitos → mostra `•••XXXX`
- Se nao → mostra nome da instancia como fallback

O problema e exclusivamente que `phone_number` esta null no banco. Corrigindo o item 1, os cards voltam a exibir os 4 ultimos digitos automaticamente.

### 3. Foto de perfil da instancia

Sobre a foto do WhatsApp da instancia: o uazapi nao fornece endpoint para buscar a foto de perfil do proprio numero conectado. A foto que aparece no painel do uazapi e a foto do dono da conta no site deles, nao a foto do WhatsApp. Portanto, **nao e possivel puxar a foto da instancia via API** -- isso nao tem impacto funcional pois o sistema ja usa Avatar com iniciais como fallback.

---

## Resumo

| Mudanca | Arquivo | Impacto |
|---|---|---|
| Auto-fetch do telefone ao conectar | `uazapi-webhook/index.ts` | Corrige `phone_number: null` para instancias uazapi |
| Nenhuma mudanca necessaria | `ConversationSidebarCard.tsx` | Ja exibe `•••XXXX` quando `phone_number` existe |

## Resultado esperado

- Instancia "Miauz" tera `phone_number` preenchido automaticamente na proxima reconexao (ou ao receber proximo evento de conexao)
- Cards de conversa voltam a mostrar `•••0484` em vez de "Miauz"
- Na pagina de Conexoes, o badge `••0484` tambem aparecera

