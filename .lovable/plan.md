
# Plano: Limite de 2 Abas + Proteção Multi-Dispositivo

## Resumo das Mudanças

| Funcionalidade | Status Atual | Após Implementação |
|----------------|--------------|-------------------|
| Abas no mesmo navegador | Limite: 1 | Limite: 2 |
| Login em dispositivos diferentes | Sem controle | Bloqueado (apenas 1 dispositivo) |
| Impacto em funcionalidades existentes | - | Nenhum |

---

## Parte 1: Permitir até 2 Abas Simultâneas

### Mudança no TabSessionContext

**Arquivo:** `src/contexts/TabSessionContext.tsx`

**Conceito:** Em vez de mostrar o diálogo de "aba duplicada" quando detecta 1 aba existente, o sistema vai:
1. Contar quantas abas estão ativas usando contagem de PONGs
2. Só mostrar o diálogo se já existirem 2 abas (limite atingido)
3. Ao fazer takeover, a aba mais antiga é desconectada

**Implementação:**

```typescript
const MAX_TABS = 2; // Configurável
const PING_TIMEOUT_MS = 500;

interface TabMessage {
  type: "PING" | "PONG" | "TAKEOVER" | "COUNT_REQUEST" | "COUNT_RESPONSE";
  tabId: string;
  userId?: string;
  timestamp?: number; // Para ordenar abas por idade
}

// Novo estado para rastrear abas ativas
const [activeTabs, setActiveTabs] = useState<Map<string, number>>(new Map());
const tabCreatedAtRef = useRef<number>(Date.now());

// Lógica modificada:
case "PONG":
  // Adiciona à lista de abas ativas
  setActiveTabs(prev => {
    const newMap = new Map(prev);
    newMap.set(message.tabId, message.timestamp || Date.now());
    return newMap;
  });
  
  // Após timeout, verifica se limite foi atingido
  if (activeTabs.size >= MAX_TABS) {
    setShowDuplicateDialog(true);
  }
  break;

case "TAKEOVER":
  // Só termina se for a aba mais antiga
  const myAge = tabCreatedAtRef.current;
  const takeoverAge = message.timestamp || 0;
  if (myAge < takeoverAge) {
    // Esta é a aba mais antiga, será desconectada
    terminateSession();
  }
  break;
```

### Atualização do Diálogo

**Arquivo:** `src/components/session/DuplicateTabDialog.tsx`

Atualizar texto para refletir o limite de 2:

```text
"O MiauChat já está aberto em 2 abas. 
Se você continuar aqui, a aba mais antiga será desconectada."
```

---

## Parte 2: Proteção Multi-Dispositivo

### Arquitetura

Para detectar logins em dispositivos diferentes, precisamos de controle no servidor (banco de dados), já que o BroadcastChannel só funciona no mesmo navegador.

**Fluxo:**
1. Ao fazer login, registra sessão no banco com `device_id` único
2. Antes de permitir acesso, verifica se há outra sessão ativa
3. Se houver, oferece opção de "continuar aqui" (invalida a outra)

### Nova Tabela: `user_device_sessions`

```sql
CREATE TABLE public.user_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL, -- Identificador único do dispositivo/navegador
  device_name TEXT, -- "Chrome no Windows", "Safari no iPhone"
  ip_address INET,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(user_id, device_id)
);

-- Índices
CREATE INDEX idx_user_device_sessions_user ON user_device_sessions(user_id);
CREATE INDEX idx_user_device_sessions_active ON user_device_sessions(user_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE user_device_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions"
ON user_device_sessions
FOR ALL
USING (user_id = auth.uid());

-- Função para verificar/registrar sessão
CREATE OR REPLACE FUNCTION check_device_session(
  _user_id UUID,
  _device_id TEXT,
  _device_name TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing_session record;
  _result jsonb;
BEGIN
  -- Buscar outra sessão ativa em dispositivo diferente
  SELECT * INTO _existing_session
  FROM user_device_sessions
  WHERE user_id = _user_id
    AND device_id != _device_id
    AND is_active = true
    AND last_active_at > now() - interval '15 minutes'
  ORDER BY last_active_at DESC
  LIMIT 1;
  
  IF _existing_session.id IS NOT NULL THEN
    -- Há sessão ativa em outro dispositivo
    RETURN jsonb_build_object(
      'allowed', false,
      'conflict', true,
      'conflicting_device', _existing_session.device_name,
      'conflicting_device_id', _existing_session.device_id,
      'last_active', _existing_session.last_active_at
    );
  END IF;
  
  -- Registrar/atualizar sessão atual
  INSERT INTO user_device_sessions (user_id, device_id, device_name, last_active_at)
  VALUES (_user_id, _device_id, _device_name, now())
  ON CONFLICT (user_id, device_id) 
  DO UPDATE SET 
    last_active_at = now(),
    device_name = COALESCE(EXCLUDED.device_name, user_device_sessions.device_name),
    is_active = true;
  
  RETURN jsonb_build_object('allowed', true, 'conflict', false);
END;
$$;

-- Função para invalidar sessão em outro dispositivo
CREATE OR REPLACE FUNCTION invalidate_other_sessions(_user_id UUID, _keep_device_id TEXT)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  UPDATE user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND device_id != _keep_device_id;
  
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
```

### Novo Hook: `useDeviceSession`

**Arquivo:** `src/hooks/useDeviceSession.tsx`

```typescript
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Gerar/persistir device_id único
function getDeviceId(): string {
  const KEY = "miauchat_device_id";
  let deviceId = localStorage.getItem(KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(KEY, deviceId);
  }
  return deviceId;
}

// Detectar nome do dispositivo
function getDeviceName(): string {
  const ua = navigator.userAgent;
  // Simplificado: "Chrome no Windows", etc.
  // ... lógica de parsing
  return "Navegador";
}

export function useDeviceSession() {
  const { user } = useAuth();
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictingDevice, setConflictingDevice] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  
  const deviceId = getDeviceId();
  
  // Verificar sessão no login
  const checkSession = useCallback(async () => {
    if (!user?.id) return;
    
    setIsChecking(true);
    const { data, error } = await supabase.rpc("check_device_session", {
      _user_id: user.id,
      _device_id: deviceId,
      _device_name: getDeviceName(),
    });
    
    if (data && !data.allowed) {
      setHasConflict(true);
      setConflictingDevice(data.conflicting_device);
    } else {
      setHasConflict(false);
    }
    setIsChecking(false);
  }, [user?.id, deviceId]);
  
  // Forçar login neste dispositivo (invalidar outros)
  const forceLoginHere = useCallback(async () => {
    if (!user?.id) return;
    
    await supabase.rpc("invalidate_other_sessions", {
      _user_id: user.id,
      _keep_device_id: deviceId,
    });
    
    // Re-registrar esta sessão
    await supabase.rpc("check_device_session", {
      _user_id: user.id,
      _device_id: deviceId,
      _device_name: getDeviceName(),
    });
    
    setHasConflict(false);
  }, [user?.id, deviceId]);
  
  // Heartbeat para manter sessão ativa
  useEffect(() => {
    if (!user?.id) return;
    
    const interval = setInterval(() => {
      supabase.rpc("check_device_session", {
        _user_id: user.id,
        _device_id: deviceId,
        _device_name: getDeviceName(),
      });
    }, 5 * 60 * 1000); // 5 minutos
    
    return () => clearInterval(interval);
  }, [user?.id, deviceId]);
  
  useEffect(() => {
    checkSession();
  }, [checkSession]);
  
  return {
    hasConflict,
    conflictingDevice,
    isChecking,
    forceLoginHere,
    deviceId,
  };
}
```

### Novo Componente: `DeviceConflictDialog`

**Arquivo:** `src/components/session/DeviceConflictDialog.tsx`

```tsx
export function DeviceConflictDialog({ 
  open, 
  conflictingDevice, 
  onContinueHere, 
  onLogout 
}: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Conta em uso em outro dispositivo</AlertDialogTitle>
          <AlertDialogDescription>
            Sua conta está conectada em: {conflictingDevice || "outro dispositivo"}.
            
            Por segurança, apenas um dispositivo pode estar conectado por vez.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onLogout}>
            Sair
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinueHere}>
            Continuar aqui
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Integração no App

**Arquivo:** `src/contexts/TabSessionContext.tsx` ou novo `DeviceSessionProvider`

Adicionar verificação de dispositivo junto com verificação de abas:

```tsx
export function TabSessionProvider({ children }: Props) {
  // ... código existente de abas ...
  
  const { 
    hasConflict, 
    conflictingDevice, 
    isChecking, 
    forceLoginHere 
  } = useDeviceSession();
  
  // Mostrar diálogo de conflito de dispositivo
  if (hasConflict) {
    return (
      <>
        {children}
        <DeviceConflictDialog
          open={true}
          conflictingDevice={conflictingDevice}
          onContinueHere={forceLoginHere}
          onLogout={handleLogout}
        />
      </>
    );
  }
  
  // ... resto do código ...
}
```

---

## Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/contexts/TabSessionContext.tsx` | Modificar | Permitir 2 abas, integrar device session |
| `src/components/session/DuplicateTabDialog.tsx` | Modificar | Atualizar texto para 2 abas |
| `src/components/session/DeviceConflictDialog.tsx` | Criar | Diálogo para conflito de dispositivo |
| `src/hooks/useDeviceSession.tsx` | Criar | Hook para gerenciar sessão por dispositivo |
| Migração SQL | Criar | Tabela `user_device_sessions` + funções |

---

## Fluxo Visual

```text
┌─────────────────────────────────────────────────────────────────┐
│                     USUÁRIO FAZ LOGIN                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │    Verificar sessão em outro device    │
         │    (check_device_session RPC)          │
         └────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │ Sem conflito    │             │ Outro device    │
     │ → Continuar     │             │ ativo           │
     └─────────────────┘             └─────────────────┘
              │                               │
              │                               ▼
              │                    ┌─────────────────────┐
              │                    │ DeviceConflictDialog│
              │                    │ "Continuar aqui"    │
              │                    │ ou "Sair"           │
              │                    └─────────────────────┘
              │                               │
              ▼                               ▼
    ┌─────────────────────────────────────────────────┐
    │            Verificar abas do navegador          │
    │            (BroadcastChannel)                   │
    └─────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
   ┌─────────────────┐                   ┌─────────────────┐
   │ < 2 abas        │                   │ = 2 abas        │
   │ → OK            │                   │ → Diálogo       │
   └─────────────────┘                   └─────────────────┘
          │                                       │
          ▼                                       ▼
   ┌─────────────────────────────────────────────────────┐
   │               ACESSO LIBERADO                        │
   │        (Realtime, Chat, Kanban, etc.)               │
   └─────────────────────────────────────────────────────┘
```

---

## Segurança e Isolamento

| Aspecto | Proteção |
|---------|----------|
| RLS | Usuários só veem/gerenciam próprias sessões |
| SECURITY DEFINER | Funções RPC isoladas do contexto de chamada |
| Device ID | Armazenado no localStorage, único por navegador |
| Heartbeat | Sessões inativas por >15min são consideradas expiradas |
| Tenant Isolation | Não afeta - sessão é por `user_id`, não `law_firm_id` |

---

## Impacto Zero em Funcionalidades Existentes

| Componente | Impacto |
|------------|---------|
| Chat/Conversas | Nenhum |
| Kanban | Nenhum |
| Agenda | Nenhum |
| IA/Agentes | Nenhum |
| Realtime | Nenhum |
| Autenticação | Apenas adiciona verificação, não altera fluxo |
| Global Admin | Funciona normalmente |

A implementação é **aditiva** - adiciona novas verificações sem modificar lógica de negócio existente.

---

## Cronograma de Implementação

1. **Migração SQL** - Criar tabela e funções
2. **useDeviceSession** - Hook de gerenciamento
3. **DeviceConflictDialog** - Componente de UI
4. **TabSessionContext** - Modificar para 2 abas + integrar device
5. **Testes** - Validar fluxos em múltiplos cenários
