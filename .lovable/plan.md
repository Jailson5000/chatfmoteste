
# Plano: Correção do groupsIgnore + Otimização de Tempo de Conexão

## Problema Identificado

O log mostra o erro crítico:
```
Failed to configure groupsIgnore for inst_5fjooku6: 
{"status":400,"error":"Bad Request","response":{"message":[["instance requires property \"rejectCall\""]]}}
```

**Causa raiz:** A Evolution API v2 **requer** que `rejectCall` seja incluído no payload do `/settings/set`. Sem isso, retorna 400 e **ignora todas as outras configurações**, incluindo `groupsIgnore`.

---

## Locais Afetados

| Local | Arquivo | Linha | Status Atual |
|-------|---------|-------|--------------|
| create_instance | evolution-api | 618-624 | ❌ Falta `rejectCall` |
| refresh_status (recreate) | evolution-api | 737-743 | ❌ Falta `rejectCall` |
| restart_instance (recreate) | evolution-api | 1436-1442 | ❌ Falta `rejectCall` |
| global_create_instance | evolution-api | 2385-2391 | ❌ Falta `rejectCall` |
| connection.update webhook | evolution-webhook | 3546-3552 | ❌ Falta `rejectCall` |
| set_settings | evolution-api | 1147-1155 | ✅ OK |

---

## Solução

### Fase 1: Payload Correto para settings/set (Correção Crítica)

Criar uma função helper para garantir payload completo em todos os lugares:

```typescript
function buildSettingsPayload(overrides?: { rejectCall?: boolean; msgCall?: string }) {
  return {
    rejectCall: overrides?.rejectCall ?? false,
    msgCall: overrides?.msgCall ?? "",
    groupsIgnore: true,     // SEMPRE true por padrão
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false,
  };
}
```

### Fase 2: Atualizar Todos os Locais

#### 2.1 evolution-api/index.ts - create_instance (linhas 617-633)
```typescript
// ANTES:
const settingsPayload = {
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: false,
  readStatus: false,
  syncFullHistory: false,
};

// DEPOIS:
const settingsPayload = {
  rejectCall: false,    // Required by Evolution API v2
  msgCall: "",
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: false,
  readStatus: false,
  syncFullHistory: false,
};
```

#### 2.2 evolution-api/index.ts - refresh_status recreate (linhas 736-752)
Mesma correção acima.

#### 2.3 evolution-api/index.ts - restart_instance recreate (linhas 1435-1451)
Mesma correção acima.

#### 2.4 evolution-api/index.ts - global_create_instance (linhas 2384-2400)
Mesma correção acima.

#### 2.5 evolution-webhook/index.ts - connection.update (linhas 3545-3561)
```typescript
// ANTES:
const settingsPayload = {
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: false,
  readStatus: false,
  syncFullHistory: false,
};

// DEPOIS:
const settingsPayload = {
  rejectCall: false,    // Required by Evolution API v2
  msgCall: "",
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: false,
  readStatus: false,
  syncFullHistory: false,
};
```

---

## Fase 3: Otimização de Tempo de Resposta (Aprovado Anteriormente)

### 3.1 Frontend - Polling Mais Rápido (Connections.tsx)

```typescript
// ANTES (linhas 100-111)
const MAX_POLLS = 60;
const BASE_POLL_INTERVAL = 2000;  // 2s
const MAX_POLL_INTERVAL = 10000;  // 10s

// DEPOIS
const MAX_POLLS = 60;
const BASE_POLL_INTERVAL = 1000;  // 1s - mais responsivo
const MAX_POLL_INTERVAL = 5000;   // 5s
```

### 3.2 Frontend - Realtime para Detecção Instantânea

Adicionar subscription Realtime para detectar quando a instância conecta:

```typescript
useEffect(() => {
  if (!isQRDialogOpen || !currentInstanceId) return;

  const channel = supabase
    .channel(`qr-connect-${currentInstanceId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_instances',
        filter: `id=eq.${currentInstanceId}`,
      },
      (payload) => {
        if ((payload.new as any)?.status === 'connected') {
          stopPolling();
          setConnectionStatus("Conectado!");
          setCurrentQRCode(null);
          refetch();
          setTimeout(() => setIsQRDialogOpen(false), 1000);
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [isQRDialogOpen, currentInstanceId]);
```

### 3.3 Frontend - Reduzir Delay de Animação

```typescript
// ANTES (linha ~159)
setTimeout(() => setIsQRDialogOpen(false), 1500);

// DEPOIS
setTimeout(() => setIsQRDialogOpen(false), 1000);
```

### 3.4 Webhook - Background Tasks para Não Bloquear

Mover tarefas secundárias para background após atualizar status como "connected":

```typescript
// PASSO 1: Atualizar status IMEDIATAMENTE
await supabaseClient
  .from('whatsapp_instances')
  .update({ status: 'connected', awaiting_qr: false, ... })
  .eq('id', instance.id);

// PASSO 2: Tarefas em background (não bloqueantes)
const backgroundWork = async () => {
  // Configurar groupsIgnore
  await fetch(`${apiUrl}/settings/set/${instance.instance_name}`, ...);
  // Buscar número do telefone
  // Reassociar órfãos
};

EdgeRuntime.waitUntil(backgroundWork());
```

---

## Arquivos a Modificar

| Arquivo | Alterações |
|---------|------------|
| `supabase/functions/evolution-api/index.ts` | Adicionar `rejectCall` em 4 lugares |
| `supabase/functions/evolution-webhook/index.ts` | Adicionar `rejectCall` + background tasks |
| `src/pages/Connections.tsx` | Polling otimizado + Realtime subscription |

---

## Resumo de Impacto

| Mudança | Impacto | Risco |
|---------|---------|-------|
| Adicionar `rejectCall` ao payload | ✅ Corrige o bug do groupsIgnore | Mínimo |
| Polling mais rápido | ⏱️ -1 a -5s latência | Mínimo |
| Realtime subscription | ⏱️ Detecção instantânea | Baixo |
| Background tasks no webhook | ⏱️ Resposta imediata | Baixo |

**Resultado Esperado:**
- `groupsIgnore` será corretamente aplicado em todas as conexões/reconexões
- Tempo de feedback após escanear QR: de 5-15s para 1-3s
