
# Melhoria no Sistema de Reconexão Automática de WhatsApp

## Diagnóstico do Problema

O sistema atual de auto-reconexão (`auto-reconnect-instances`) possui uma lacuna importante:

**Fluxo Atual:**
```
1. Instância fica "disconnected" no banco
2. auto-reconnect-instances → chama /instance/restart
3. Se restart falha → chama /instance/connect
4. Se retorna QR code → marca como awaiting_qr (para de tentar)
```

**Problema:**
O sistema não verifica primeiro se a instância AINDA está conectada na Evolution API. Quando você clicou em "Atualizar Status", ele chamou `/instance/connectionState/` e descobriu que a sessão ainda estava ativa no servidor - apenas o banco de dados estava desatualizado.

**Fluxo Ideal (Proposto):**
```
1. Instância fica "disconnected" no banco
2. auto-reconnect-instances → PRIMEIRO verifica /instance/connectionState
   - Se retorna "open/connected" → atualiza banco e pronto! (sem QR)
   - Se retorna outro estado → tenta restart/connect
3. Menos interrupções para o cliente
```

---

## Solução Proposta

### Modificar `auto-reconnect-instances/index.ts`

Adicionar uma **verificação de status** antes de tentar restart:

| Etapa | Ação | Resultado |
|-------|------|-----------|
| 1 | Chamar `/instance/connectionState/{name}` | Verificar se está realmente offline |
| 2 | Se status = "open" ou "connected" | Atualizar banco para "connected" e PARAR |
| 3 | Se status ≠ conectado | Seguir fluxo atual (restart → connect) |

### Benefícios

1. **Menos falsos positivos**: Se a Evolution API ainda tem a sessão ativa, não precisa fazer nada
2. **Cliente não fica OFF**: Reconecta automaticamente sem precisar de QR quando possível
3. **Reduz alertas desnecessários**: Menos e-mails de "WhatsApp desconectado"
4. **Mais robusto**: Tenta 3x com verificação de status, não apenas restart cego

---

## Código da Modificação

### Nova função: `checkConnectionState`

```typescript
// Check if instance is actually connected on Evolution API before attempting restart
async function checkConnectionState(instance: InstanceToReconnect): Promise<{
  isConnected: boolean;
  state: string;
}> {
  const apiUrl = normalizeUrl(instance.api_url);
  
  try {
    console.log(`[Auto-Reconnect] Checking connection state for ${instance.instance_name}...`);
    
    const statusResponse = await fetchWithTimeout(
      `${apiUrl}/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
      {
        method: "GET",
        headers: {
          apikey: instance.api_key,
          "Content-Type": "application/json",
        },
      },
      10000
    );

    if (!statusResponse.ok) {
      console.log(`[Auto-Reconnect] Connection state check returned ${statusResponse.status}`);
      return { isConnected: false, state: "unknown" };
    }

    const data = await statusResponse.json();
    const state = data.state || data.instance?.state || "unknown";
    const isConnected = state === "open" || state === "connected";
    
    console.log(`[Auto-Reconnect] Connection state for ${instance.instance_name}: ${state} (connected: ${isConnected})`);
    
    return { isConnected, state };
  } catch (error: any) {
    console.log(`[Auto-Reconnect] Connection state check failed for ${instance.instance_name}:`, error.message);
    return { isConnected: false, state: "error" };
  }
}
```

### Modificação no loop principal

Antes de chamar `attemptRestart`, adicionar:

```typescript
// STEP 1: Check if instance is actually connected in Evolution API
// This catches cases where the DB is out of sync but session is still active
const connectionCheck = await checkConnectionState(instance);

if (connectionCheck.isConnected) {
  console.log(`[Auto-Reconnect] Instance ${instance.instance_name} is actually connected in Evolution API - updating DB only`);
  
  // Update database to connected status
  await supabaseClient
    .from("whatsapp_instances")
    .update({
      status: "connected",
      disconnected_since: null,
      reconnect_attempts_count: 0,
      awaiting_qr: false,
      manual_disconnect: false,
      alert_sent_for_current_disconnect: false,
      updated_at: now.toISOString(),
    })
    .eq("id", instance.id);
  
  results.push({
    instance_id: instance.id,
    instance_name: instance.instance_name,
    success: true,
    action: "status_sync",
    message: "Instance was already connected - database synced",
  });
  
  continue; // Skip to next instance, no restart needed
}

// STEP 2: If not connected, proceed with restart attempt
const result = await attemptRestart(instance);
```

---

## Resumo das Alterações

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/auto-reconnect-instances/index.ts` | Adicionar verificação de status antes de restart |

---

## Fluxo Final Melhorado

```
┌─────────────────────────────────────────────────────────────────┐
│  AUTO-RECONNECT MELHORADO                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Instância marcada como "disconnected" no banco              │
│     ↓                                                            │
│  2. CRON executa auto-reconnect-instances (cada 1 min)          │
│     ↓                                                            │
│  3. [NOVO] Verificar /instance/connectionState primeiro         │
│     ↓                                                            │
│  4a. Se "open/connected":                                        │
│      → Atualiza banco para "connected"                          │
│      → Cliente NÃO fica offline ✅                               │
│      → Sem QR necessário ✅                                      │
│     ↓                                                            │
│  4b. Se não conectado:                                           │
│      → Tenta /instance/restart                                   │
│      → Se falhar, tenta /instance/connect                        │
│      → Se retornar QR → marca awaiting_qr                        │
│                                                                  │
│  Máximo: 3 tentativas em 3 minutos                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Checklist de Validação

- [ ] Verificar status antes de tentar restart
- [ ] Se já conectado na Evolution → sincronizar banco apenas
- [ ] Se não conectado → seguir fluxo de restart/connect
- [ ] Logs claros para depuração
- [ ] Não quebrar o fluxo existente para casos onde restart é necessário
