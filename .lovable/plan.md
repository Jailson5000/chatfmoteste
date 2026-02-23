

# Plano: Corrigir Geração de QR Code e Race Condition no Polling

## Problema Identificado

Os logs mostram uma contradição clara:
```
Level 2 (create) recovery successful - QR code obtained!
Level 2 - QR extracted from create response!
Levels 1-2 exhausted without QR. Returning retryable.
```

Isso acontece porque:
1. O frontend faz **polling agressivo** chamando `get_qrcode` repetidamente
2. A primeira chamada faz Level 2 recovery (logout + delete + create) e obtém o QR Code
3. Enquanto essa chamada ainda processa, **outra chamada paralela** entra e vê `{"count":0}` porque a instância acabou de ser recriada
4. A segunda chamada dispara **outro** Level 2, deletando a instância que acabou de ser criada
5. O resultado final retorna "exhausted" ao frontend, que nunca recebe o QR Code

Sobre a instância 3528 (`inst_eqblozqc`): ela caiu por causa do `docker restart evolution`, que forca re-autenticacao de **todas** as instancias. Isso e esperado -- ela precisa ser reconectada via QR Code.

## Solucao em 2 Partes

### Parte 1: Protecao contra chamadas paralelas no backend

No `evolution-api/index.ts`, adicionar um **guard** que impede multiplas chamadas `get_qrcode` de executar recovery simultaneamente para a mesma instancia:

- Antes de iniciar Level 1/Level 2 recovery, verificar se a instancia ja esta em `awaiting_qr` com um `updated_at` recente (menos de 60 segundos)
- Se estiver, retornar `retryable: true` sem disparar novo ciclo de recovery
- Isso impede o loop destrutivo onde uma chamada desfaz o trabalho da outra

### Parte 2: Debounce no polling do frontend

No `src/pages/Connections.tsx`, evitar que o polling chame `get_qrcode` enquanto uma chamada anterior ainda esta em andamento:

- Adicionar um flag `isQrFetchInProgress` para impedir chamadas paralelas
- Aumentar o intervalo minimo de polling para QR Code (de ~3s para ~8s)
- Quando o backend retornar `retryable: true`, aguardar o tempo sugerido antes de tentar novamente

## Detalhes Tecnicos

### Arquivo 1: `supabase/functions/evolution-api/index.ts`

Na secao de `isCorruptedSession` (linha ~1100), antes de iniciar o Level 1 recovery:

```typescript
// GUARD: Check if another get_qrcode call recently ran recovery
const { data: freshInstance } = await supabaseClient
  .from("whatsapp_instances")
  .select("status, awaiting_qr, updated_at")
  .eq("id", body.instanceId)
  .single();

const updatedAgo = freshInstance?.updated_at 
  ? Date.now() - new Date(freshInstance.updated_at).getTime() 
  : Infinity;

// If instance was updated to awaiting_qr in the last 60s, 
// another call already ran recovery -- just return retryable
if (freshInstance?.awaiting_qr === true && updatedAgo < 60000) {
  console.log(`[Evolution API] Recovery already in progress (updated ${updatedAgo}ms ago). Skipping.`);
  // Try one simple connect to see if QR is available now
  try {
    const quickResp = await fetchWithTimeout(
      `${apiUrl}/instance/connect/${instance.instance_name}`,
      { method: "GET", headers: recoveryHeaders }, 8000
    );
    if (quickResp.ok) {
      const quickData = await quickResp.json();
      const quickQr = extractQrFromResponse(quickData);
      if (quickQr) {
        return await returnQrSuccess(quickQr, "Quick retry");
      }
    }
  } catch (_) {}
  
  return new Response(JSON.stringify({
    success: false,
    error: "Recuperacao em andamento. Aguarde 10 segundos...",
    retryable: true,
    connectionState: "recovering",
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Mark instance as recovering BEFORE starting Level 1
await supabaseClient
  .from("whatsapp_instances")
  .update({ awaiting_qr: true, updated_at: new Date().toISOString() })
  .eq("id", body.instanceId);
```

### Arquivo 2: `src/pages/Connections.tsx`

Adicionar debounce no `pollOnce`:

```typescript
const qrFetchInProgressRef = useRef(false);

// Inside pollOnce, wrap the getQRCode call:
if (!currentQRCode) {
  if (qrFetchInProgressRef.current) {
    console.log("[Connections] QR fetch already in progress, skipping this poll");
    // Schedule next poll
    const nextInterval = getPollingInterval(count);
    pollIntervalRef.current = setTimeout(() => pollOnce(instanceId), nextInterval);
    return;
  }
  
  qrFetchInProgressRef.current = true;
  try {
    const qrResult = await getQRCode.mutateAsync(instanceId);
    // ... existing handling ...
  } finally {
    qrFetchInProgressRef.current = false;
  }
}
```

Tambem aumentar o intervalo minimo de polling de 3s para 8s quando ainda nao tem QR Code.

## Resultado Esperado

1. A primeira chamada `get_qrcode` executa o Level 2 recovery normalmente e retorna o QR Code
2. Chamadas subsequentes detectam que a recovery ja esta em andamento e fazem apenas um `connect` simples para buscar o QR existente
3. O frontend nao dispara chamadas paralelas, evitando o loop destrutivo
4. As instancias desconectadas pelo `docker restart` poderao ser reconectadas normalmente via QR Code

