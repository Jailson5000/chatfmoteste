

# Correcoes: Botoes de Acao, Pagina Branca e Numero

## 3 Problemas Identificados

### 1. Botoes "Desconectar" e "Reiniciar" nao funcionais para Uazapi

**Desconectar:** O codigo backend (`evolution-api/index.ts` linhas 2387-2404) JA suporta uazapi — chama `provider.disconnect(config)` que faz `POST /instance/disconnect`. O frontend passa `onLogout={() => logoutInstance.mutate(selectedInstance.id)}`. Isso deveria funcionar. 

**Reiniciar:** O hook `restartInstance` usa `action: "get_qrcode"` (linha 484), nao `restart_instance`. Para uazapi, `get_qrcode` chama `provider.connect()` que faz `POST /instance/connect`. Isso funciona como reconexao, nao como restart. Porem o backend `restart_instance` (linha 2462-2473) chama `provider.disconnect()` e marca como `disconnected` + `manual_disconnect: true` — isso e errado para restart, pois deveria reconectar automaticamente.

**Correcao no backend:**
- `restart_instance` para uazapi: chamar disconnect, aguardar 2s, chamar connect novamente, e atualizar status conforme resultado (sem marcar `manual_disconnect`)
- O frontend ja chama corretamente

### 2. Pagina branca ao acessar /connections (stale chunk cache)

**Causa raiz:** O console mostra `Failed to fetch dynamically imported module: Connections-d2jCs7xN.js` (404). Apos cada deploy, os nomes dos chunks mudam (hash). Se o usuario tem a aba aberta ou cache antigo, o `React.lazy()` tenta carregar o chunk antigo que nao existe mais — falha silenciosamente e mostra pagina branca.

**Correcao:** Adicionar retry com reload automatico nos `React.lazy()` imports. Padrao comum: se o import falha, recarregar a pagina uma vez (usando sessionStorage flag para evitar loop infinito).

**Arquivo:** `src/App.tsx` — criar helper `lazyWithRetry` que wrapa `React.lazy()` com catch + `window.location.reload()`.

### 3. Numero nao encontrado e refresh nao funciona

**Analise:** O `refresh_phone` para uazapi (linhas 2231-2258) chama `provider.getStatus()` que faz `GET /instance/status` e extrai `data?.phone || data?.number || data?.ownerJid?.split("@")[0]`. Se a API do uazapi nao retorna o telefone no endpoint de status, o numero fica null.

**Problema:** A API do uazapi pode retornar o numero em um campo diferente (ex: `data?.user`, `data?.me?.user`, `data?.jid`) ou em endpoint diferente (ex: `/me`, `/profile`).

**Correcao:**
- No `whatsapp-provider.ts`, adicionar fallback no `getStatus` do uazapi: alem dos campos atuais, verificar `data?.user`, `data?.me?.user`, `data?.me?.id`, `data?.jid`
- Adicionar um endpoint alternativo: se `getStatus` nao retorna phone, tentar `GET /me` ou `GET /instance/me` com header `token`
- Apos conexao bem-sucedida, a pagina ja chama `refreshPhone.mutate(currentInstanceId)` — entao se o endpoint retorna o numero, vai funcionar

## Resumo de Mudancas

| Arquivo | Mudanca | Prioridade |
|---|---|---|
| `src/App.tsx` | Criar `lazyWithRetry()` para evitar pagina branca apos deploys | CRITICO |
| `supabase/functions/evolution-api/index.ts` | Corrigir `restart_instance` para uazapi: disconnect + delay + reconnect (sem `manual_disconnect`) | ALTO |
| `supabase/functions/_shared/whatsapp-provider.ts` | Ampliar campos de extracao de telefone no `getStatus` do uazapi + adicionar fallback via endpoint `/me` | ALTO |

## Detalhes Tecnicos

### lazyWithRetry (App.tsx)
```typescript
function lazyWithRetry(importFn: () => Promise<any>) {
  return React.lazy(() =>
    importFn().catch(() => {
      const hasReloaded = sessionStorage.getItem("chunk_reload");
      if (!hasReloaded) {
        sessionStorage.setItem("chunk_reload", "1");
        window.location.reload();
        return { default: () => null }; // never renders
      }
      sessionStorage.removeItem("chunk_reload");
      throw new Error("Failed to load page");
    })
  );
}
```
Substituir todos os `React.lazy(() => import(...))` por `lazyWithRetry(() => import(...))`.

### restart_instance para uazapi
```typescript
if (isUazapi(instance)) {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  // Disconnect
  await provider.disconnect(config).catch(() => {});
  // Wait 2s
  await new Promise(r => setTimeout(r, 2000));
  // Reconnect
  const connectResult = await provider.connect(config);
  
  const newStatus = connectResult.status === "connected" ? "connected" : "connecting";
  await supabaseClient.from("whatsapp_instances")
    .update({ status: newStatus, manual_disconnect: false, updated_at: new Date().toISOString() })
    .eq("id", body.instanceId);
    
  return Response({ success: true, message: "Instance restarted", qrCode: connectResult.qrCode });
}
```

### getStatus uazapi — extracao ampliada de telefone
Adicionar ao provider uazapi:
```typescript
const phoneNumber = data?.phone || data?.number || data?.user ||
  data?.me?.user || data?.me?.id?.split("@")[0] ||
  data?.ownerJid?.split("@")[0] || data?.jid?.split("@")[0] || null;
```
E se `phoneNumber` ainda for null e status for "connected", tentar `GET /me`:
```typescript
if (!phoneNumber && status === "connected") {
  const meRes = await fetchWithTimeout(`${apiUrl}/me`, { headers: { token: config.apiKey } });
  if (meRes.ok) {
    const meData = await meRes.json().catch(() => ({}));
    phoneNumber = meData?.phone || meData?.number || meData?.user || meData?.jid?.split("@")[0] || null;
  }
}
```

## Resultado Esperado

- Pagina de conexoes nunca mais fica branca apos deploy (auto-reload)
- Botao "Desconectar" funciona (ja funcionava no backend, verificar se ha erro no frontend)
- Botao "Reiniciar" faz disconnect + reconnect real em vez de so desconectar
- Numero do telefone e buscado corretamente via campos expandidos + endpoint `/me`

