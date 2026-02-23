

## Corrigir Ciclo Destrutivo do Auto-Reconnect

### Problema Real Identificado (com provas dos logs)

O cron `auto-reconnect-instances` esta CAUSANDO as desconexoes, nao corrigindo-as:

```text
Logs auto-reconnect (14:50):
- inst_l26f156k: connectionState = "connecting" → chama /instance/connect
- inst_5fjooku6: connectionState = "connecting" → chama /instance/connect
- inst_464pnw5n: connectionState = "connecting" → chama /instance/connect
- inst_ea9bfhx3: connectionState = "close" → chama /instance/connect
- inst_0gkejsc5: connectionState = "close" → chama /instance/connect
- inst_d92ekkep: connectionState = "close" → chama /instance/connect
Summary: "6 successful (0 status syncs)" = NENHUMA reconhecida como conectada
```

Ao mesmo tempo, o `refresh_status` (que usa `fetchInstances`) mostra essas MESMAS instancias como `connected`. O Manager da Evolution tambem mostra conectadas.

O ciclo destrutivo:

```text
1. connectionState retorna "close" (dado STALE - bug Evolution v2.3+)
2. auto-reconnect chama /instance/connect na instancia conectada
3. /instance/connect reinicia a sessao WhatsApp
4. Evolution envia eventos "connecting" via webhook
5. Webhook marca como "connecting" no banco
6. 5 minutos depois, cron ve "connecting" e repete tudo
7. Instancias NUNCA estabilizam como "connected"
8. ZERO eventos messages.upsert chegam (nenhuma mensagem recebida)
```

### Solucao: Usar fetchInstances no auto-reconnect (mesmo fix do refresh_status)

**Arquivo: `supabase/functions/auto-reconnect-instances/index.ts`**

Reescrever a funcao `checkConnectionState` (linhas 177-214) para usar `fetchInstances` como fonte primaria, igual ao que ja fizemos no `refresh_status`:

```text
async function checkConnectionState(instance) {
  const apiUrl = normalizeUrl(instance.api_url);

  // PRIMARY: fetchInstances (mesma fonte que Evolution Manager)
  try {
    const fetchUrl = `${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instance_name)}`;
    const response = await fetchWithTimeout(fetchUrl, {
      method: "GET",
      headers: { apikey: instance.api_key, "Content-Type": "application/json" },
    }, 10000);

    if (response.ok) {
      const data = await response.json();
      const instances = Array.isArray(data) ? data : data?.instances || [data];
      const found = instances.find(i =>
        i?.instanceName === instance.instance_name ||
        i?.name === instance.instance_name
      ) || instances[0];

      if (found) {
        const state = found.connectionStatus || found.status || found.state || "unknown";
        const isConnected = state === "open" || state === "connected";
        return { isConnected, state };
      }
    }
  } catch (e) {
    // fallback below
  }

  // FALLBACK: connectionState (pode ser impreciso mas melhor que nada)
  try {
    const response = await fetchWithTimeout(
      `${apiUrl}/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
      { method: "GET", headers: { apikey: instance.api_key, "Content-Type": "application/json" } },
      10000
    );
    if (response.ok) {
      const data = await response.json();
      const state = data.state || data.instance?.state || "unknown";
      return { isConnected: state === "open" || state === "connected", state };
    }
  } catch (e) {
    // both failed
  }

  return { isConnected: false, state: "error" };
}
```

Isso vai fazer com que o auto-reconnect RECONHECA que as instancias estao conectadas (via `fetchInstances` que retorna `connectionStatus: "open"`) e NAO chame `/instance/connect` desnecessariamente.

### Impacto Esperado

| Antes | Depois |
|---|---|
| checkConnectionState usa connectionState (retorna "close" para instancias conectadas) | Usa fetchInstances como primario (retorna "open" corretamente) |
| 6 instancias recebem /instance/connect a cada 5 min desnecessariamente | Instancias conectadas sao reconhecidas e nao reiniciadas |
| 0 status syncs (nenhuma reconhecida) | Instancias reconhecidas, DB sincronizado sem reiniciar sessao |
| Loop infinito connecting→connect→connecting | Ciclo quebrado - instancias estabilizam como connected |
| Zero messages.upsert recebidos | Mensagens voltam a fluir normalmente |

### Arquivo editado

- `supabase/functions/auto-reconnect-instances/index.ts`
