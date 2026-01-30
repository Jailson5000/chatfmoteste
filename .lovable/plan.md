
# Plano: Rastreamento de Usuários Online e Último Acesso

## Contexto

Atualmente, o sistema **não possui** funcionalidade para:
- Ver quando um usuário acessou pela última vez
- Ver se um usuário está online no momento
- Monitorar a atividade dos usuários por empresa

A tabela `profiles` não tem campos de `last_seen_at` ou similar.

## Arquitetura Proposta

Vamos implementar um sistema híbrido que combina:

1. **Persistência (last_seen_at)**: Atualiza no banco quando o usuário navega
2. **Realtime Presence**: Mostra quem está online em tempo real

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ARQUITETURA DE PRESENÇA                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CAMADA 1: Persistência (last_seen_at)                                     │
│  ─────────────────────────────────────                                     │
│  - Atualiza profiles.last_seen_at a cada 5 minutos de atividade            │
│  - Histórico permanente de último acesso                                   │
│  - Visível mesmo após usuário sair                                         │
│                                                                             │
│  CAMADA 2: Realtime Presence (online_now)                                  │
│  ─────────────────────────────────────────                                 │
│  - Supabase Realtime Presence API                                          │
│  - Indica se usuário está AGORA com sessão ativa                           │
│  - Atualiza em tempo real quando entra/sai                                 │
│                                                                             │
│  RESULTADO NO UI:                                                          │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │ 🟢 João Silva     Admin        Online agora                  │          │
│  │ 🟡 Maria Santos   Atendente    Há 5 minutos                  │          │
│  │ ⚫ Pedro Souza    Atendente    Há 3 dias                     │          │
│  └──────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Componentes a Implementar

### 1. Migração SQL

Adicionar campo `last_seen_at` à tabela `profiles`:

```sql
-- Adicionar coluna de último acesso
ALTER TABLE public.profiles
ADD COLUMN last_seen_at timestamptz DEFAULT now();

-- Índice para ordenação por último acesso
CREATE INDEX idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);

-- Criar tabela para tracking de sessões ativas (opcional, para histórico)
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  law_firm_id uuid REFERENCES public.law_firms(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ip_address text,
  user_agent text,
  device_type text,
  is_active boolean DEFAULT true
);

-- RLS para sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Política: Admins globais podem ver tudo
CREATE POLICY "Global admins can view all sessions"
ON public.user_sessions FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Política: Admins da empresa podem ver da própria empresa
CREATE POLICY "Tenant admins can view own sessions"
ON public.user_sessions FOR SELECT
TO authenticated
USING (law_firm_id = public.get_user_law_firm_id(auth.uid()));
```

### 2. Hook: usePresenceTracking

```typescript
// src/hooks/usePresenceTracking.tsx
// Responsável por:
// - Atualizar last_seen_at periodicamente
// - Broadcast presença via Supabase Realtime
// - Limpar presença ao sair
```

Este hook será chamado no `AppLayout` para todos os usuários logados.

### 3. Hook: useUserPresence

```typescript
// src/hooks/useUserPresence.tsx
// Responsável por:
// - Consultar usuários online de uma empresa
// - Subscribe para atualizações em tempo real
// - Retornar lista com status de cada usuário
```

### 4. Componente: UserPresenceIndicator

```typescript
// src/components/ui/UserPresenceIndicator.tsx
// Badge visual que mostra:
// - 🟢 Online (presença ativa)
// - 🟡 Recente (< 5 min desde last_seen)
// - ⚫ Offline (> 5 min)
```

### 5. Atualização do CompanyUsersDialog

Adicionar coluna de "Último Acesso" e indicador de online:

```typescript
// Na tabela de usuários:
<TableHead>Status Online</TableHead>
<TableHead>Último Acesso</TableHead>

// Na célula:
<TableCell>
  <UserPresenceIndicator userId={user.id} />
</TableCell>
<TableCell>
  {user.last_seen_at 
    ? formatDistanceToNow(new Date(user.last_seen_at), { locale: ptBR })
    : "Nunca acessou"}
</TableCell>
```

---

## Fluxo de Funcionamento

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ FLUXO: USUÁRIO ACESSA O SISTEMA                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Login                                                                   │
│        │                                                                    │
│        ▼                                                                    │
│  2. AppLayout monta com usePresenceTracking                                │
│        │                                                                    │
│        ├──── Atualiza profiles.last_seen_at imediatamente                  │
│        │                                                                    │
│        ├──── Entra no canal Realtime "presence:law_firm_id"                │
│        │                                                                    │
│        └──── Chama channel.track({ user_id, online_at })                   │
│                                                                             │
│  3. A cada 5 minutos de atividade                                          │
│        │                                                                    │
│        └──── Atualiza profiles.last_seen_at                                │
│                                                                             │
│  4. Outros usuários no canal recebem evento 'join'                         │
│        │                                                                    │
│        └──── UI atualiza indicador para 🟢                                 │
│                                                                             │
│  5. Usuário fecha aba / sai                                                │
│        │                                                                    │
│        ├──── beforeunload: chama channel.untrack()                         │
│        │                                                                    │
│        └──── Outros recebem 'leave' → UI mostra 🟡 ou ⚫                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/hooks/usePresenceTracking.tsx` | Criar | Hook para rastrear e emitir presença |
| `src/hooks/useUserPresence.tsx` | Criar | Hook para consultar presença de empresa |
| `src/components/ui/UserPresenceIndicator.tsx` | Criar | Componente visual de status |
| `src/components/layout/AppLayout.tsx` | Modificar | Adicionar usePresenceTracking |
| `src/components/global-admin/CompanyUsersDialog.tsx` | Modificar | Adicionar colunas de presença |

### Migração SQL

```sql
-- 1. Adicionar last_seen_at na profiles
ALTER TABLE public.profiles ADD COLUMN last_seen_at timestamptz DEFAULT now();

-- 2. Criar índice
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at 
ON public.profiles(last_seen_at DESC);
```

---

## Implementação Detalhada

### usePresenceTracking (Simplificado)

```typescript
export function usePresenceTracking() {
  const { user } = useAuth();
  const { lawFirm } = useLawFirm();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastUpdateRef = useRef<number>(0);
  
  useEffect(() => {
    if (!user?.id || !lawFirm?.id) return;

    // Função para atualizar last_seen_at
    const updateLastSeen = async () => {
      const now = Date.now();
      // Throttle: só atualiza a cada 5 minutos
      if (now - lastUpdateRef.current < 5 * 60 * 1000) return;
      
      lastUpdateRef.current = now;
      await supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id);
    };

    // Atualizar imediatamente ao montar
    updateLastSeen();

    // Criar canal de presença
    const channel = supabase.channel(`presence:${lawFirm.id}`, {
      config: { presence: { key: user.id } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        // Sincronização de estado
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('Usuário entrou:', key);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('Usuário saiu:', key);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    // Atualizar last_seen em atividade
    const handleActivity = throttle(updateLastSeen, 60000); // 1 min throttle
    
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);

    // Cleanup
    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [user?.id, lawFirm?.id]);
}
```

### useUserPresence (Para Global Admin)

```typescript
export function useUserPresence(lawFirmId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    if (!lawFirmId) return;

    const channel = supabase.channel(`presence:${lawFirmId}`);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const online: Record<string, boolean> = {};
        Object.keys(state).forEach(key => {
          online[key] = true;
        });
        setOnlineUsers(online);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lawFirmId]);

  return { onlineUsers };
}
```

---

## UX no CompanyUsersDialog

### Stats Atualizados
```text
┌──────────────────────────────────────────────────────────────────────────┐
│  👥 Total: 5  │  🟢 Online: 2  │  🔴 Admins: 1  │  ⚠️ Senha: 1          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Tabela com Presença
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Usuário          │ Cargo        │ Status       │ Online    │ Último Acesso │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🟢 João Silva    │ Admin        │ Ativo        │ Online    │ Agora         │
│ 🟢 Maria Santos  │ Atendente    │ Ativo        │ Online    │ Agora         │
│ 🟡 Pedro Souza   │ Atendente    │ Ativo        │ Offline   │ Há 5 min      │
│ ⚫ Ana Costa     │ Gerente      │ Ativo        │ Offline   │ Há 2 dias     │
│ ⚫ Carlos Lima   │ Atendente    │ Inativo      │ Offline   │ Há 1 mês      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Benefícios

1. **Visibilidade**: Admin global sabe quem está usando o sistema
2. **Suporte**: Identifica usuários que nunca acessaram (onboarding incompleto)
3. **Monitoramento**: Detecta contas inativas para liberar licenças
4. **Tempo real**: Presença atualiza instantaneamente via WebSockets

---

## Considerações de Performance

| Aspecto | Solução |
|---------|---------|
| Updates frequentes no DB | Throttle de 5 minutos |
| Múltiplas abas | Usa mesmo canal de presença por user_id |
| Cleanup de sessões | beforeunload + heartbeat timeout |
| Carga no Realtime | Um canal por law_firm (não por usuário) |

---

## Checklist de Implementação

**Fase 1: Backend**
- [ ] Migração: adicionar profiles.last_seen_at
- [ ] Criar índice para ordenação

**Fase 2: Hooks de Presença**
- [ ] Criar usePresenceTracking
- [ ] Criar useUserPresence
- [ ] Integrar usePresenceTracking no AppLayout

**Fase 3: UI**
- [ ] Criar UserPresenceIndicator
- [ ] Atualizar CompanyUsersDialog com novas colunas
- [ ] Adicionar stat de "Online" nos cards

**Fase 4: Testes**
- [ ] Verificar atualização de last_seen_at
- [ ] Testar presença em tempo real entre abas
- [ ] Validar cleanup ao fechar aba
