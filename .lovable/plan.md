
# Correção do Sistema de Notificações de Mensagens

## Problema Identificado

O hook `useMessageNotifications` cria um canal Realtime **sem filtro de tenant**:

```typescript
// ATUAL - PROBLEMÁTICO (linha 67-79)
const channel = supabase
  .channel("messages-notifications")
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "messages",
    // ❌ SEM FILTRO law_firm_id!
  }, handleNewMessage)
```

**Consequência**: O Supabase Realtime não entrega eventos porque:
1. RLS bloqueia a validação do filtro (tabela `messages` tem RLS)
2. Canal duplicado conflita com `tenant-messages-{lawFirmId}` do `RealtimeSyncContext`

---

## Solução: Integrar com RealtimeSyncContext

O `RealtimeSyncContext` já:
- ✅ Recebe eventos de `messages` com filtro `law_firm_id`
- ✅ Expõe `registerMessageCallback` para receber payloads
- ✅ Está montado no `App.tsx` envolvendo toda a aplicação

**Mudança**: Remover o canal próprio e usar o callback do contexto consolidado.

---

## Código Antes vs Depois

### ANTES (não funciona):
```typescript
// Cria canal separado sem filtro
const channel = supabase
  .channel("messages-notifications")
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "messages",
  }, handleNewMessage)
  .subscribe();
```

### DEPOIS (integrado):
```typescript
import { useRealtimeSyncOptional } from "@/hooks/useRealtimeSync";

// Usa o callback do contexto consolidado
const realtimeSync = useRealtimeSyncOptional();

useEffect(() => {
  if (!enabled || !lawFirm?.id) return;
  
  // Solicitar permissão de notificação browser
  if (browserEnabled && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // Registrar callback no sistema consolidado
  if (realtimeSync?.registerMessageCallback) {
    const unregister = realtimeSync.registerMessageCallback((payload) => {
      if (payload.eventType === "INSERT") {
        handleNewMessage({ new: payload.new as Message });
      }
    });
    return unregister;
  }
}, [enabled, lawFirm?.id, browserEnabled, realtimeSync, handleNewMessage]);
```

---

## Análise de Risco

| Aspecto | Avaliação |
|---------|-----------|
| **Pode quebrar?** | **NÃO** - Apenas substitui a fonte do evento |
| **Afeta outras funcionalidades?** | **NÃO** - Mudança isolada no hook |
| **Eventos serão recebidos?** | **SIM** - `RealtimeSyncContext` já funciona corretamente |
| **Performance?** | **MELHORA** - Remove canal duplicado (1 WebSocket a menos) |
| **Reversível?** | **SIM** - Basta restaurar o código original |

### Por que é seguro:

1. **Fallback automático**: `useRealtimeSyncOptional` retorna `null` se não estiver no Provider (mas está)
2. **Lógica de notificação preservada**: `handleNewMessage` permanece idêntico
3. **Preferências respeitadas**: `soundEnabled` e `browserEnabled` continuam funcionando
4. **Sem dependências novas**: Usa hooks que já existem no projeto

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useMessageNotifications.tsx` | Remover canal próprio, usar `registerMessageCallback` |

---

## Validação Pós-Deploy

1. ✅ Acessar página de conversas
2. ✅ Receber mensagem de um cliente WhatsApp
3. ✅ Verificar se som toca (se ativado nas preferências)
4. ✅ Verificar se notificação browser aparece (se ativada)
5. ✅ Conferir console para logs de erro

---

## Plano de Rollback (se necessário)

Se algo der errado, basta restaurar o arquivo original:

```typescript
// Restaurar canal direto (código atual)
const channel = supabase
  .channel("messages-notifications")
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "messages",
  }, handleNewMessage)
  .subscribe();
```

Mas isso não será necessário porque a mudança é conservadora e usa infraestrutura já testada.
