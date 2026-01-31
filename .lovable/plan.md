
# Plano: Detecção de Abas Duplicadas com BroadcastChannel API

## Objetivo

Implementar detecção de abas duplicadas que:
1. Quando uma **nova aba** abre, avisa o usuário que já existe outra aba ativa
2. Se o usuário confirmar, a **aba antiga é desconectada** (WebSockets fechados + sessão encerrada)
3. A **nova aba assume** como sessão principal

## Arquitetura Proposta

```
+----------------+     BroadcastChannel      +----------------+
|   ABA ANTIGA   |  <----- "TAKEOVER" ----   |   ABA NOVA     |
|  (será fechada)|                           | (assume sessão)|
+----------------+                           +----------------+
       |                                            |
       v                                            |
 Desconecta Realtime                                |
 Mostra "Sessão encerrada"                          |
                                                    v
                                             Continua normal
```

## Fluxo de Funcionamento

1. **Nova aba abre** -> Envia mensagem `PING` pelo BroadcastChannel
2. **Aba antiga responde** -> `PONG` confirmando que existe
3. **Nova aba exibe dialog** -> "Já existe outra aba aberta. Continuar aqui?"
4. **Usuário confirma** -> Nova aba envia `TAKEOVER`
5. **Aba antiga recebe** -> Desconecta Realtime, mostra overlay "Sessão encerrada nesta aba"

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/contexts/TabSessionContext.tsx` | **Criar** | Context para gerenciar sessão de aba |
| `src/components/session/DuplicateTabDialog.tsx` | **Criar** | Dialog avisando sobre aba duplicada |
| `src/components/session/SessionTerminatedOverlay.tsx` | **Criar** | Overlay quando aba é desconectada |
| `src/App.tsx` | **Modificar** | Adicionar TabSessionProvider |
| `src/contexts/RealtimeSyncContext.tsx` | **Modificar** | Expor método para desconectar canais |

## Implementação Detalhada

### 1. TabSessionContext.tsx (Novo)

```typescript
// Gerencia:
// - ID único da aba (gerado com crypto.randomUUID)
// - BroadcastChannel para comunicação inter-abas
// - Estados: isPrimaryTab, showDuplicateDialog, isTerminated
// - Métodos: takeoverSession, terminateSession

const CHANNEL_NAME = "miauchat-tab-session";

interface TabMessage {
  type: "PING" | "PONG" | "TAKEOVER";
  tabId: string;
  userId?: string;
}
```

**Lógica principal:**
- Ao montar, gera `tabId` único e envia `PING`
- Se receber `PONG` de outra aba (mesmo userId), mostra dialog
- Se usuário confirmar, envia `TAKEOVER`
- Aba que recebe `TAKEOVER` desconecta e mostra overlay

### 2. DuplicateTabDialog.tsx (Novo)

```tsx
// AlertDialog com:
// - Título: "Aba duplicada detectada"
// - Mensagem: "O MiauChat já está aberto em outra aba..."
// - Botão "Continuar aqui" -> dispara takeover
// - Botão "Cancelar" -> fecha dialog, não faz nada
```

### 3. SessionTerminatedOverlay.tsx (Novo)

```tsx
// Overlay fullscreen com:
// - Ícone de alerta
// - "Esta sessão foi encerrada"
// - "O MiauChat está ativo em outra aba"
// - Botão "Recarregar esta aba" -> window.location.reload()
```

### 4. Modificar RealtimeSyncContext.tsx

Adicionar método `disconnectAll()`:
```typescript
interface RealtimeSyncContextType {
  // ... existing ...
  disconnectAll: () => void;
}

const disconnectAll = useCallback(() => {
  [coreChannelRef, messagesChannelRef, agendaChannelRef, conversationChannelRef]
    .forEach(ref => {
      if (ref.current) {
        supabase.removeChannel(ref.current);
        ref.current = null;
      }
    });
  setIsConnected(false);
  setChannelCount(0);
}, []);
```

### 5. Modificar App.tsx

```tsx
<QueryClientProvider client={queryClient}>
  <TenantProvider>
    <TabSessionProvider>  {/* NOVO */}
      <RealtimeSyncProvider>
        {/* ... rest */}
      </RealtimeSyncProvider>
    </TabSessionProvider>
  </TenantProvider>
</QueryClientProvider>
```

## Análise de Risco

| Risco | Mitigação |
|-------|-----------|
| BroadcastChannel não suportado | Fallback: não faz nada (navegadores antigos) |
| Múltiplos usuários no mesmo browser | Mensagens incluem `userId` para filtrar |
| Aba fecha antes de responder | Timeout de 500ms no PING, se não receber PONG, continua normal |
| Race condition entre abas | Cada aba tem ID único, última a enviar TAKEOVER ganha |

## Compatibilidade

- **Chrome/Edge**: 54+ (2016)
- **Firefox**: 38+ (2015)
- **Safari**: 15.4+ (2022)
- **Fallback**: Se `BroadcastChannel` não existir, não implementa a feature (graceful degradation)

## Garantias de Segurança

- **Sem regressões**: Funcionalidade é aditiva, não altera fluxos existentes
- **Sem banco de dados**: Tudo acontece localmente via BroadcastChannel
- **Isolado por usuário**: Mensagens filtradas por userId
- **Graceful degradation**: Navegadores sem suporte continuam funcionando normalmente
- **Sem quebrar Realtime existente**: Apenas adiciona método `disconnectAll`
