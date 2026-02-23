

## Corrigir Tela "Verificando acesso..." Travada

### Problema
O banco de dados esta com instabilidade de conexao (logs mostram `dial error: i/o timeout` e 504 no endpoint `/user`). Quando isso acontece:

1. O hook `useCompanyApproval` faz queries ao banco (`profiles` e `companies`) que ficam pendentes indefinidamente
2. O `ProtectedRoute` mostra "Verificando acesso..." eternamente porque `approvalLoading` nunca vira `false`
3. Edge functions (`evolution-health`, `sync-evolution-instances`, `get-billing-status`) tambem falham porque `getUser(token)` depende do mesmo banco

### Causa Raiz
O Lovable Cloud esta com o banco de dados sobrecarregado (connection pool esgotado ou instancia pequena). Os logs de auth confirmam:
- 13:16:40Z - `/user` retornou 500 (context canceled)
- 13:24:27Z - `/user` retornou 504 (timeout de 11s conectando ao Postgres) 
- 13:26:49Z - `/user` retornou 200, mas com 4s de latencia

### Correcoes

**1. Adicionar timeout ao `useCompanyApproval` (evitar tela travada para sempre)**

Arquivo: `src/hooks/useCompanyApproval.tsx`

Envolver as queries do banco com um `Promise.race` contra um timeout de 15 segundos. Se o timeout ocorrer, definir `loading: false` com uma mensagem de erro amigavel e botao para tentar novamente.

```text
const fetchWithTimeout = (promise, timeoutMs = 15000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    )
  ]);
};

// Usar em cada query:
const { data: profile } = await fetchWithTimeout(
  supabase.from('profiles').select('law_firm_id').eq('id', user.id).maybeSingle()
);
```

No catch, quando o erro for TIMEOUT, definir um estado que permita retry:

```text
catch (err) {
  if (err.message === 'TIMEOUT') {
    setStatus(prev => ({
      ...prev,
      approval_status: null, // NAO bloquear, apenas mostrar erro
      loading: false,
    }));
  }
}
```

**2. Adicionar botao "Tentar novamente" na tela de loading do ProtectedRoute**

Arquivo: `src/components/auth/ProtectedRoute.tsx`

Na tela de "Verificando acesso...", adicionar um timeout visual de 10 segundos. Apos o timeout, mostrar um botao "Tentar novamente" que chama `window.location.reload()` e uma mensagem informando que o servidor pode estar lento.

```text
// Adicionar estado para controlar timeout visual
const [showRetry, setShowRetry] = useState(false);

useEffect(() => {
  if (approvalLoading || tenantLoading) {
    const timer = setTimeout(() => setShowRetry(true), 10000);
    return () => clearTimeout(timer);
  } else {
    setShowRetry(false);
  }
}, [approvalLoading, tenantLoading]);

// Na UI de loading:
{showRetry && (
  <div className="flex flex-col items-center gap-2 mt-4">
    <p className="text-sm text-muted-foreground">
      O servidor esta demorando mais que o normal...
    </p>
    <Button onClick={() => window.location.reload()}>
      Tentar novamente
    </Button>
  </div>
)}
```

**3. Adicionar timeout ao `useTenant` para query do banco**

Arquivo: `src/hooks/useTenant.tsx`

A query `supabase.from('law_firms').select(...)` tambem pode travar. Adicionar o mesmo padrao de timeout de 15 segundos. Se falhar, definir `isLoading: false` com erro para nao bloquear a UI.

### Resultado Esperado

1. Se o banco estiver lento/offline, a tela "Verificando acesso..." mostra um botao "Tentar novamente" apos 10 segundos em vez de ficar travada infinitamente
2. As queries do `useCompanyApproval` e `useTenant` tem timeout de 15 segundos
3. O usuario pode clicar "Tentar novamente" para recarregar quando o banco se recuperar
4. Edge functions vao voltar a funcionar sozinhas quando o banco se estabilizar (nao precisam de correcao de codigo)

### Detalhes Tecnicos

Arquivos a editar:
- `src/hooks/useCompanyApproval.tsx` - Adicionar timeout de 15s nas queries
- `src/hooks/useTenant.tsx` - Adicionar timeout de 15s na query de law_firms
- `src/components/auth/ProtectedRoute.tsx` - Adicionar botao "Tentar novamente" apos 10s de loading

