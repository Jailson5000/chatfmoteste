

# Tornar uazapi 100% funcional -- substituir todas as dependencias do Evolution API

## Diagnostico

Analisei todo o sistema e identifiquei que **2 Edge Functions criticas** ainda operam exclusivamente com endpoints da Evolution API, sem nenhum tratamento para instancias uazapi:

### 1. `auto-reconnect-instances/index.ts` (800 linhas)

**Problemas:**
- Usa `esm.sh` para importar supabase-js (proibido -- causa erros 401/522)
- Funcoes `checkConnectionState()`, `attemptConnect()`, `deleteAndRecreateInstance()`, `forceLogout()` chamam diretamente endpoints da Evolution API (`/instance/fetchInstances`, `/instance/connectionState`, `/instance/connect`, `/instance/logout`, `/instance/delete`, `/instance/create`) com header `apikey`
- Nao verifica `api_provider` -- instancias uazapi recebem chamadas Evolution que falham silenciosamente
- A instancia uazapi `inst_xcehi4b8` esta marcada como "connected" sem `phone_number`, e o auto-reconnect nao consegue verificar se realmente esta conectada

**Correcoes:**
- Trocar import para `npm:@supabase/supabase-js@2`
- Adicionar filtro `api_provider` na query inicial: processar apenas instancias `evolution` OU criar branch uazapi
- Para instancias uazapi: usar `GET /instance/status` com header `token` (em vez de `apikey`) para verificar estado
- Para reconexao uazapi: usar `POST /instance/connect` com header `token`
- Nao tentar `deleteAndRecreateInstance` para uazapi (fluxo diferente: `init` + `connect`)
- Ignorar ghost session detection para uazapi (nao tem o conceito de fetchInstances vs connectionState)

### 2. `sync-evolution-instances/index.ts` (580 linhas)

**Problemas:**
- Usa `esm.sh` para importar supabase-js
- `fetchEvolutionInstances()` chama `GET /instance/fetchInstances` com header `apikey` -- endpoint que nao existe no uazapi
- `fetchInstanceDetails()` chama endpoints Evolution para buscar numero de telefone
- Filtra instancias DB por `api_url` para fazer match com conexoes Evolution -- nao considera uazapi
- Atualiza status de instancias uazapi baseado em respostas de endpoints Evolution (que falham)

**Correcoes:**
- Trocar import para `npm:@supabase/supabase-js@2`
- Adicionar filtro para processar apenas instancias com `api_provider = 'evolution'` (ou null)
- Instancias uazapi nao precisam de sync via `evolution_api_connections` -- elas usam credenciais individuais

### 3. `whatsapp-provider.ts` -- Correcoes pendentes

O arquivo `_shared/whatsapp-provider.ts` esta exportando `sendContact` e `deleteMessage` mas faltam metodos:
- `archiveChat`: uazapi tem endpoint `POST /chat/archive` conforme docs. Deve ser adicionado ao UazapiProvider.
- `sendContact` no EvolutionProvider: esta ausente (nao tem implementacao, se chamado lanca erro)

### 4. `evolution-api/index.ts` -- Actions globais sem uazapi

As actions `global_configure_webhook`, `global_get_status`, `global_create_instance`, `global_recreate_instance`, `global_delete_instance`, `global_logout_instance` usam `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` como credenciais fixas. Estas actions precisam de branch uazapi que busque as credenciais de `system_settings`.

---

## Plano de implementacao

### Arquivo 1: `supabase/functions/auto-reconnect-instances/index.ts`

1. **Linha 2**: Trocar `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` para `import { createClient } from "npm:@supabase/supabase-js@2"`

2. **Linha 471-476**: Na query de instancias, adicionar campo `api_provider`:
```typescript
.select("id, instance_name, status, api_url, api_key, api_provider, law_firm_id, ...")
```

3. **Criar funcao `checkConnectionStateUazapi()`** para verificar status via `GET /instance/status` com header `token`:
```typescript
async function checkConnectionStateUazapi(instance: InstanceToReconnect): Promise<{
  isConnected: boolean;
  state: string;
  ghostSession: boolean;
}> {
  const apiUrl = normalizeUrl(instance.api_url);
  try {
    const res = await fetchWithTimeout(`${apiUrl}/instance/status`, {
      method: "GET",
      headers: { token: instance.api_key, "Content-Type": "application/json" },
    }, 10000);
    if (!res.ok) return { isConnected: false, state: "error", ghostSession: false };
    const data = await res.json().catch(() => ({}));
    const state = data?.status || data?.state || "unknown";
    const isConnected = state === "connected" || state === "open";
    return { isConnected, state, ghostSession: false };
  } catch {
    return { isConnected: false, state: "error", ghostSession: false };
  }
}
```

4. **Criar funcao `attemptConnectUazapi()`** para reconexao via `POST /instance/connect`:
```typescript
async function attemptConnectUazapi(instance: InstanceToReconnect): Promise<ReconnectResult> {
  const apiUrl = normalizeUrl(instance.api_url);
  try {
    const res = await fetchWithTimeout(`${apiUrl}/instance/connect`, {
      method: "POST",
      headers: { token: instance.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, 15000);
    if (!res.ok) return { instance_id: instance.id, instance_name: instance.instance_name, success: false, action: "connect", message: `Connect failed (${res.status})` };
    const data = await res.json().catch(() => ({}));
    const state = data?.status || data?.state || "unknown";
    const qrcode = data?.qrcode || data?.base64 || null;
    if (state === "connected" || state === "open") {
      return { instance_id: instance.id, instance_name: instance.instance_name, success: true, action: "connect", message: "Instance reconnected automatically" };
    }
    if (qrcode) {
      return { instance_id: instance.id, instance_name: instance.instance_name, success: false, action: "connect", message: "QR code scan required", qrcode, needs_qr: true };
    }
    return { instance_id: instance.id, instance_name: instance.instance_name, success: true, action: "connect", message: `Connection initiated (${state})` };
  } catch (e: any) {
    return { instance_id: instance.id, instance_name: instance.instance_name, success: false, action: "connect", message: e.message };
  }
}
```

5. **No loop principal (linhas 599-741)**: Adicionar branch por `api_provider`:
```typescript
const isUazapiInstance = (instance as any).api_provider === "uazapi";

// STEP 1: Check connection
const connectionCheck = isUazapiInstance 
  ? await checkConnectionStateUazapi(instance)
  : await checkConnectionState(instance);

// STEP 3: Attempt reconnect
const result = isUazapiInstance
  ? await attemptConnectUazapi(instance)
  : await attemptConnect(instance);
```

6. **Pular ghost session detection e `deleteAndRecreateInstance` para uazapi** -- nao se aplica.

### Arquivo 2: `supabase/functions/sync-evolution-instances/index.ts`

1. **Linha 2**: Trocar `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` para `import { createClient } from "npm:@supabase/supabase-js@2"`

2. **Linha 353-358**: Na query de `whatsapp_instances`, filtrar apenas Evolution:
```typescript
const { data: dbInstances } = await supabaseAdmin
  .from("whatsapp_instances")
  .select("*")
  .or("api_provider.eq.evolution,api_provider.is.null"); // Apenas Evolution
```

Isso impede que instancias uazapi sejam marcadas como "stale" (nao encontradas no Evolution) ou tenham seus status sobrescritos.

### Arquivo 3: `supabase/functions/_shared/whatsapp-provider.ts`

Adicionar `archiveChat` ao UazapiProvider (conforme docs `/chat/archive`):
```typescript
async archiveChat(config: ProviderConfig, chatId: string, archive: boolean): Promise<void> {
  const apiUrl = normalizeUrl(config.apiUrl);
  await fetchWithTimeout(`${apiUrl}/chat/archive`, {
    method: "POST",
    headers: { token: config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, archive }),
  });
}
```

Adicionar `sendContact` ao EvolutionProvider (stub que nao faz nada ou adapta para o formato Evolution):
```typescript
async sendContact(_config: ProviderConfig, _opts: SendContactOptions): Promise<SendTextResult> {
  console.warn("[EvolutionProvider] sendContact not implemented");
  return { success: false, whatsappMessageId: undefined };
}
```

### Arquivo 4: `supabase/functions/evolution-api/index.ts`

Nas actions `global_configure_webhook` e `global_get_status` (linhas ~4100+):
- Para instancias com `api_provider = 'uazapi'`: usar `system_settings` para buscar credenciais e chamar endpoints uazapi
- Para instancias com `api_provider = 'evolution'` ou null: manter logica atual

---

## Resumo de mudancas

| Arquivo | Mudanca | Impacto |
|---|---|---|
| `auto-reconnect-instances/index.ts` | Import npm, branch uazapi para check/reconnect | **CRITICO** -- impede chamadas Evolution em instancias uazapi |
| `sync-evolution-instances/index.ts` | Import npm, filtrar apenas instancias Evolution | **CRITICO** -- impede marcacao incorreta como "stale" |
| `_shared/whatsapp-provider.ts` | Adicionar `archiveChat`, `sendContact` no EvolutionProvider | Funcionalidade completa |
| `evolution-api/index.ts` | Branch uazapi nas actions globais | Admin pode gerenciar instancias uazapi |

## Resultado esperado

- Auto-reconnect funciona para instancias uazapi (verifica status e reconecta usando os endpoints corretos)
- Sync nao marca instancias uazapi como "not_found_in_evolution"
- Arquivamento de chat disponivel via uazapi
- Erros 401/522 eliminados nas Edge Functions corrigidas (import npm)

