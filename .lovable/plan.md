

# Corrigir Cascata de Token Refresh -- Converter useAuth em AuthProvider

## Problema

O hook `useAuth()` e chamado independentemente em 27 arquivos. Cada chamada cria seu proprio listener (`onAuthStateChange`) e timer (`scheduleTokenRefresh`). Resultado:

- 27 instancias de `useAuth` criando 27 listeners + 27 timers
- Mais 1 listener do `AuthCacheInvalidator` (App.tsx)
- Mais 1 do `TabSessionContext`
- Mais 1 do `useAdminAuth` (nas rotas admin)
- Total: ate **30 listeners** simultaneos no SDK de auth

Quando 1 token e refreshed, o evento `TOKEN_REFRESHED` dispara todos os 30 listeners, que tentam agendar novos refreshes, gerando cascata e rate limit 429.

---

## Analise de Riscos

### Risco 1: Ordem de Providers (MEDIO)
**O que pode quebrar:** O `AuthProvider` precisa estar DENTRO do `QueryClientProvider` (porque vai usar `queryClient` para invalidar cache) e FORA dos demais providers que dependem de auth (`TenantProvider`, `TabSessionProvider`, `RealtimeSyncProvider`).

**Mitigacao:** Seguir exatamente a ordem: `QueryClientProvider` > `AuthProvider` > `TenantProvider` > `TabSessionProvider` > `RealtimeSyncProvider`

### Risco 2: useAuth fora do Provider (BAIXO)
**O que pode quebrar:** Se algum componente usar `useAuth()` fora da arvore do `AuthProvider`, vai dar erro "useAuth must be used within AuthProvider". Isso poderia afetar paginas publicas como `/auth`, `/register`, `/reset-password`.

**Mitigacao:** O `AuthProvider` sera colocado no topo do `App.tsx`, envolvendo TODAS as rotas (incluindo publicas). Assim nenhum componente fica fora. A pagina `Auth.tsx` ja usa `useAuth()` para checar se o usuario esta logado -- isso continuara funcionando normalmente.

### Risco 3: useAdminAuth conflito (BAIXO)
**O que pode quebrar:** O `AdminAuthProvider` tambem cria seu proprio `onAuthStateChange`. Nao vamos mexer nele, pois so e montado nas rotas `/global-admin/*` e coexiste sem problemas -- ele trata eventos admin-especificos.

**Mitigacao:** Nenhuma alteracao no `useAdminAuth`. Ele continuara funcionando independentemente.

### Risco 4: Race condition na inicializacao (BAIXO)
**O que pode quebrar:** Se o `AuthProvider` demorar para inicializar, componentes filhos podem receber `user: null` temporariamente, causando flicker ou redirect para `/auth`.

**Mitigacao:** O estado `loading: true` ja existe e sera mantido. Componentes como `ProtectedRoute` ja checam `loading` antes de decidir qualquer coisa.

### Risco 5: AuthCacheInvalidator redundante (NENHUM)
**O que pode quebrar:** Remover o `AuthCacheInvalidator` pode fazer com que o cache nao seja limpo no login/logout.

**Mitigacao:** A mesma logica sera movida para dentro do `AuthProvider`, no handler de `SIGNED_IN` e `SIGNED_OUT`. Resultado identico, sem componente extra.

### Risco 6: TabSessionContext listener (NENHUM)
**O que pode quebrar:** O `TabSessionContext` tem seu proprio `onAuthStateChange` para rastrear `userId`.

**Mitigacao:** Nao vamos mexer nele. Esse listener e leve (so seta um estado) e nao faz refresh de token.

---

## Solucao

### Arquivo 1: `src/hooks/useAuth.tsx`

Reestruturar de hook independente para Context/Provider:

```text
ANTES (executado 27 vezes):
export function useAuth() {
  const [user, setUser] = useState(...)
  useEffect(() => {
    supabase.auth.onAuthStateChange(...)  // 27 listeners
    supabase.auth.getSession()             // 27 chamadas
    scheduleTokenRefresh(...)              // 27 timers
  }, [])
  return { user, session, loading, ... }
}

DEPOIS (executado 1 vez):
const AuthContext = createContext(...)

export function AuthProvider({ children }) {
  // TODA a logica atual de useAuth, executada UMA VEZ
  const [user, setUser] = useState(...)
  useEffect(() => {
    supabase.auth.onAuthStateChange(...)  // 1 listener
    supabase.auth.getSession()             // 1 chamada
    scheduleTokenRefresh(...)              // 1 timer
  }, [])
  
  // Integrar logica do AuthCacheInvalidator aqui:
  // SIGNED_IN -> queryClient.invalidateQueries()
  // SIGNED_OUT -> queryClient.clear()
  
  return <AuthContext.Provider value={...}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context  // apenas consome, zero listeners
}
```

- A interface publica do `useAuth()` nao muda: `{ user, session, loading, mustChangePassword, signOut, refreshToken, handleApiError, sessionExpired, clearSessionExpired, clearMustChangePassword }`
- Os 27 arquivos que importam `useAuth` continuam funcionando sem nenhuma alteracao

### Arquivo 2: `src/App.tsx`

```text
ANTES:
<QueryClientProvider>
  <TenantProvider>
    <TabSessionProvider>
      <RealtimeSyncProvider>
        <AuthCacheInvalidator />   <-- listener extra desnecessario
        ...

DEPOIS:
<QueryClientProvider>
  <AuthProvider>                   <-- ADICIONAR (1 unico listener)
    <TenantProvider>
      <TabSessionProvider>
        <RealtimeSyncProvider>
          ...                      <-- SEM AuthCacheInvalidator
```

- Remover componente `AuthCacheInvalidator` (logica integrada no `AuthProvider`)

---

## Resultado

| Metrica | Antes | Depois |
|---|---|---|
| Listeners `onAuthStateChange` | ~30 | 4 (AuthProvider + AdminAuth + TabSession + AuthCallback) |
| Timers de refresh | ~27 | 1 |
| Chamadas `getSession` na init | ~27 | 1 |
| Arquivos alterados | - | 2 (`useAuth.tsx` + `App.tsx`) |
| Arquivos que usam useAuth | 27 | 27 (zero alteracoes) |

