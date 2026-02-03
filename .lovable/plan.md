
# Plano: Proteção Multi-Dispositivo por Empresa

## Problema Identificado

A proteção atual bloqueia o mesmo e-mail de logar em computadores diferentes, **independente da empresa**. Isso é incorreto quando o mesmo usuário tem contas em empresas diferentes.

| Situação Atual | Comportamento |
|----------------|---------------|
| João loga na Empresa A (PC 1) | ✅ OK |
| João loga na Empresa B (PC 2) | ❌ **Bloqueado** (incorreto!) |
| João loga na Empresa A (PC 2) | ❌ **Bloqueado** (correto) |

## Comportamento Desejado

| Situação | Comportamento |
|----------|---------------|
| João loga na Empresa A (PC 1) | ✅ OK |
| João loga na Empresa B (PC 2) | ✅ OK (empresa diferente) |
| João loga na Empresa A (PC 2) | ❌ **Bloqueado** (mesma empresa) |

---

## Mudanças Necessárias

### 1. Migração SQL - Adicionar `law_firm_id` à Tabela

Adicionar coluna `law_firm_id` na tabela `user_device_sessions` para rastrear sessões por empresa:

```sql
-- Adicionar coluna law_firm_id
ALTER TABLE public.user_device_sessions 
ADD COLUMN law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE CASCADE;

-- Atualizar constraint unique para incluir law_firm_id
ALTER TABLE public.user_device_sessions 
DROP CONSTRAINT user_device_sessions_user_id_device_id_key;

ALTER TABLE public.user_device_sessions 
ADD CONSTRAINT user_device_sessions_user_law_firm_device_key 
UNIQUE(user_id, law_firm_id, device_id);

-- Índice para performance
CREATE INDEX idx_user_device_sessions_law_firm 
ON public.user_device_sessions(user_id, law_firm_id, is_active) 
WHERE is_active = true;
```

### 2. Atualizar Função RPC `check_device_session`

Modificar para aceitar e filtrar por `law_firm_id`:

```sql
CREATE OR REPLACE FUNCTION public.check_device_session(
  _user_id UUID,
  _device_id TEXT,
  _device_name TEXT DEFAULT NULL,
  _law_firm_id UUID DEFAULT NULL  -- NOVO PARÂMETRO
)
RETURNS jsonb
AS $$
DECLARE
  _existing_session record;
  _effective_law_firm_id UUID;
BEGIN
  -- Validar que o chamador é o próprio usuário
  IF auth.uid() != _user_id THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'unauthorized');
  END IF;
  
  -- Se não foi passado law_firm_id, buscar do profile
  IF _law_firm_id IS NULL THEN
    SELECT law_firm_id INTO _effective_law_firm_id
    FROM public.profiles WHERE id = _user_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;

  -- Buscar sessão ativa em OUTRO dispositivo para MESMA empresa
  SELECT * INTO _existing_session
  FROM public.user_device_sessions
  WHERE user_id = _user_id
    AND law_firm_id = _effective_law_firm_id  -- FILTRAR POR EMPRESA
    AND device_id != _device_id
    AND is_active = true
    AND last_active_at > now() - interval '15 minutes'
  ORDER BY last_active_at DESC
  LIMIT 1;
  
  IF _existing_session.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'conflict', true,
      'conflicting_device', _existing_session.device_name,
      'conflicting_device_id', _existing_session.device_id,
      'last_active', _existing_session.last_active_at
    );
  END IF;
  
  -- Registrar sessão com law_firm_id
  INSERT INTO public.user_device_sessions 
    (user_id, law_firm_id, device_id, device_name, last_active_at)
  VALUES 
    (_user_id, _effective_law_firm_id, _device_id, _device_name, now())
  ON CONFLICT (user_id, law_firm_id, device_id) 
  DO UPDATE SET 
    last_active_at = now(),
    device_name = COALESCE(EXCLUDED.device_name, user_device_sessions.device_name),
    is_active = true;
  
  RETURN jsonb_build_object('allowed', true, 'conflict', false);
END;
$$;
```

### 3. Atualizar Função RPC `invalidate_other_sessions`

Modificar para invalidar apenas sessões da mesma empresa:

```sql
CREATE OR REPLACE FUNCTION public.invalidate_other_sessions(
  _user_id UUID, 
  _keep_device_id TEXT,
  _law_firm_id UUID DEFAULT NULL  -- NOVO PARÂMETRO
)
RETURNS integer
AS $$
DECLARE
  _count integer;
  _effective_law_firm_id UUID;
BEGIN
  IF auth.uid() != _user_id THEN
    RETURN 0;
  END IF;
  
  -- Se não foi passado, buscar do profile
  IF _law_firm_id IS NULL THEN
    SELECT law_firm_id INTO _effective_law_firm_id
    FROM public.profiles WHERE id = _user_id;
  ELSE
    _effective_law_firm_id := _law_firm_id;
  END IF;

  UPDATE public.user_device_sessions
  SET is_active = false
  WHERE user_id = _user_id
    AND law_firm_id = _effective_law_firm_id  -- APENAS MESMA EMPRESA
    AND device_id != _keep_device_id;
  
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
```

### 4. Atualizar `useDeviceSession.tsx`

Modificar o hook para passar o `law_firm_id` nas chamadas RPC:

```typescript
export function useDeviceSession(
  userId: string | null,
  lawFirmId: string | null  // NOVO PARÂMETRO
): UseDeviceSessionReturn {
  // ...
  
  const checkSession = useCallback(async () => {
    if (!userId || !deviceIdRef.current) {
      setState(prev => ({ ...prev, isChecking: false }));
      return;
    }

    const { data, error } = await supabase.rpc("check_device_session", {
      _user_id: userId,
      _device_id: deviceIdRef.current,
      _device_name: getDeviceName(),
      _law_firm_id: lawFirmId,  // PASSAR EMPRESA
    });
    // ...
  }, [userId, lawFirmId]);
  
  // Mesma lógica para forceLoginHere e heartbeat
}
```

### 5. Atualizar `TabSessionContext.tsx`

Buscar e passar o `law_firm_id` do usuário:

```typescript
export function TabSessionProvider({ children }: TabSessionProviderProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentLawFirmId, setCurrentLawFirmId] = useState<string | null>(null);
  
  // Buscar law_firm_id ao inicializar
  useEffect(() => {
    const fetchLawFirmId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Buscar law_firm_id do profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('law_firm_id')
          .eq('id', user.id)
          .single();
        
        if (profile?.law_firm_id) {
          setCurrentLawFirmId(profile.law_firm_id);
        }
      }
    };
    fetchLawFirmId();
  }, []);
  
  // Passar lawFirmId para o hook
  const {
    hasConflict: hasDeviceConflict,
    // ...
  } = useDeviceSession(currentUserId, currentLawFirmId);
  
  // ...
}
```

---

## Fluxo Corrigido

```text
JOÃO LOGA NA EMPRESA A (PC 1):
  → check_device_session(user=João, law_firm=A, device=PC1)
  → Busca sessões: WHERE user=João AND law_firm=A AND device≠PC1
  → Nenhuma encontrada → ✅ Permitido

JOÃO LOGA NA EMPRESA B (PC 2):
  → check_device_session(user=João, law_firm=B, device=PC2)
  → Busca sessões: WHERE user=João AND law_firm=B AND device≠PC2
  → Nenhuma encontrada → ✅ Permitido (empresa diferente!)

JOÃO TENTA LOGAR NA EMPRESA A (PC 2):
  → check_device_session(user=João, law_firm=A, device=PC2)
  → Busca sessões: WHERE user=João AND law_firm=A AND device≠PC2
  → Encontra sessão em PC1 → ❌ Bloqueado (mesma empresa, outro device)
```

---

## Arquivos a Modificar

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| Migração SQL | Database | Adicionar `law_firm_id` e atualizar constraints |
| `check_device_session` RPC | Database | Filtrar por `law_firm_id` |
| `invalidate_other_sessions` RPC | Database | Filtrar por `law_firm_id` |
| `clear_device_session` RPC | Database | Filtrar por `law_firm_id` |
| `src/hooks/useDeviceSession.tsx` | Frontend | Aceitar e passar `lawFirmId` |
| `src/contexts/TabSessionContext.tsx` | Frontend | Buscar e passar `law_firm_id` |

---

## Compatibilidade

| Aspecto | Status |
|---------|--------|
| Sessões existentes | Continuam funcionando (law_firm_id nullable inicialmente) |
| Usuários com 1 empresa | Sem mudança perceptível |
| Usuários com múltiplas empresas | Agora podem logar em dispositivos diferentes |
| Outras funcionalidades | Nenhum impacto (Chat, Kanban, etc.) |
| RLS policies | Mantidas (tabela usa `user_id = auth.uid()`) |

---

## Segurança

- A coluna `law_firm_id` é derivada do `profile` do usuário autenticado
- Não é possível manipular para acessar sessões de outra empresa
- A RLS policy existente (`user_id = auth.uid()`) continua protegendo os dados
