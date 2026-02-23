

## Corrigir Sincronizacao de Status das Instancias WhatsApp

### Problema Raiz Identificado (com provas)

Testei as instancias diretamente chamando a Edge Function `refresh_status` e obtive os seguintes resultados:

- `inst_464pnw5n` (WhatsApp Central Atendimento) - Evolution retorna `state: "close"` - marcado como `disconnected`
- `inst_5fjooku6` (FMOANTIGO63) - Evolution retorna `state: "close"` - marcado como `disconnected`
- `inst_7sw6k99c` (MIAU) - Evolution retorna `state: "connecting"` - marcado como `connecting`

Porem, o painel Manager da Evolution API mostra essas mesmas instancias como "Connected". Isso acontece porque:

**O endpoint `connectionState` da Evolution API v2.3+ e INSTAVEL** - ele retorna dados desatualizados (stale). O painel Manager da Evolution usa o endpoint `fetchInstances` que retorna o `connectionStatus` real.

O codigo atual do `refresh_status` usa APENAS o endpoint `connectionState`:
```text
GET /instance/connectionState/{instanceName}
```

Mas deveria usar o `fetchInstances` que e o mesmo endpoint que o Manager UI usa:
```text
GET /instance/fetchInstances?instanceName={instanceName}
```

Este endpoint retorna `connectionStatus: "open"` quando conectado, que e o status correto.

### Correcao

**Arquivo: `supabase/functions/evolution-api/index.ts`**

Reescrever o case `refresh_status` (linhas 1279-1333) para:

1. Usar `fetchInstances?instanceName=X` como endpoint PRIMARIO (mesmo que o Manager UI)
2. Manter `connectionState` como FALLBACK caso fetchInstances falhe
3. Adicionar logging detalhado da resposta da Evolution API para diagnostico futuro
4. Quando o status real for `connected`, tambem limpar flags de desconexao (disconnected_since, awaiting_qr)

```text
case "refresh_status": {
  if (!body.instanceId) throw new Error("instanceId is required");

  const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId, isGlobalAdmin);
  const apiUrl = normalizeUrl(instance.api_url);

  let dbStatus = "disconnected";
  let evolutionState = "unknown";
  let sourceEndpoint = "none";

  // PRIMARY: Use fetchInstances (same as Evolution Manager UI)
  try {
    const fetchUrl = `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instance_name)}`;
    const fetchResponse = await fetchWithTimeout(fetchUrl, {
      method: "GET",
      headers: { apikey: instance.api_key || "", "Content-Type": "application/json" },
    });

    if (fetchResponse.ok) {
      const fetchData = await fetchResponse.json();
      console.log(`[Evolution API] fetchInstances raw response:`, JSON.stringify(fetchData).slice(0, 500));

      // Parse response (can be array or object)
      const instances = Array.isArray(fetchData) ? fetchData : fetchData?.instances || [fetchData];
      const found = instances.find(i => i?.instanceName === instance.instance_name || i?.name === instance.instance_name) || instances[0];

      if (found) {
        // connectionStatus is what Manager UI uses
        evolutionState = found.connectionStatus || found.status || found.state || "unknown";
        sourceEndpoint = "fetchInstances";
      }
    }
  } catch (e) {
    console.warn(`[Evolution API] fetchInstances failed, trying connectionState:`, e.message);
  }

  // FALLBACK: connectionState endpoint
  if (sourceEndpoint === "none") {
    try {
      const stateResponse = await fetchWithTimeout(
        `${apiUrl}/instance/connectionState/${instance.instance_name}`,
        { method: "GET", headers: { apikey: instance.api_key || "", "Content-Type": "application/json" } }
      );
      if (stateResponse.ok) {
        const stateData = await stateResponse.json();
        console.log(`[Evolution API] connectionState raw:`, JSON.stringify(stateData));
        evolutionState = stateData.state || stateData.instance?.state || "unknown";
        sourceEndpoint = "connectionState";
      }
    } catch (e) {
      console.error(`[Evolution API] Both endpoints failed:`, e.message);
    }
  }

  // Map Evolution state to our DB status
  if (evolutionState === "open" || evolutionState === "connected") {
    dbStatus = "connected";
  } else if (evolutionState === "connecting" || evolutionState === "qr") {
    dbStatus = "connecting";
  } else if (evolutionState === "close" || evolutionState === "closed") {
    dbStatus = "disconnected";
  }

  // Build update payload with proper flag cleanup
  const updatePayload: Record<string, unknown> = {
    status: dbStatus,
    updated_at: new Date().toISOString(),
  };

  if (dbStatus === "connected") {
    updatePayload.disconnected_since = null;
    updatePayload.awaiting_qr = false;
    updatePayload.reconnect_attempts_count = 0;
  } else if (dbStatus === "disconnected") {
    if (!instance.disconnected_since) {
      updatePayload.disconnected_since = new Date().toISOString();
    }
  }

  const { data: updatedInstance } = await supabaseClient
    .from("whatsapp_instances")
    .update(updatePayload)
    .eq("id", body.instanceId)
    .select()
    .single();

  console.log(`[Evolution API] Status refreshed: ${dbStatus} (source: ${sourceEndpoint}, evolution: ${evolutionState})`);

  return new Response(JSON.stringify({
    success: true, status: dbStatus, evolutionState, sourceEndpoint, instance: updatedInstance,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

### Resumo

| Antes | Depois |
|---|---|
| Usa `connectionState` (instavel, retorna "close" para instancias conectadas) | Usa `fetchInstances` como primario (mesmo do Manager UI) |
| Sem logging da resposta | Log completo da resposta da Evolution API |
| Nao limpa flags ao reconectar | Limpa disconnected_since, awaiting_qr quando connected |
| Um unico endpoint, sem fallback | fetchInstances primario + connectionState como fallback |

### Impacto

- O botao "Atualizar Status" vai refletir o mesmo estado que o Manager da Evolution mostra
- Instancias que estao realmente conectadas serao marcadas como `connected` corretamente
- Diagnostico facilitado com logs detalhados das respostas da API

### Arquivo editado

- `supabase/functions/evolution-api/index.ts`
