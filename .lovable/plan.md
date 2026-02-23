

## Corrigir Login Travado em "Entrando..."

### Problema

O login esta travado em "Entrando..." em AMBAS as telas (regular e global admin) porque a chamada `signInWithPassword` depende do banco de dados (GoTrue -> Postgres), e quando o banco esta lento ou com timeout, a chamada fica pendente sem limite de tempo. A terceira tela (fmoadv) mostra apenas o logo porque o `useAuth` esta preso no loading (sessao antiga com refresh token invalido).

### Causa Raiz

1. Os logs de auth mostram restart do servico de auth as 13:28-13:29, invalidando todos os refresh tokens
2. Tentativas de refresh retornam "Refresh Token Not Found" (13:30 e 13:32)
3. `signInWithPassword` nao tem timeout - fica pendente quando o DB esta lento
4. `GlobalAdminAuth` nao reseta `isSubmitting` no caminho de sucesso (so no erro)

### Correcoes

**Arquivo 1: `src/pages/Auth.tsx`**

Envolver `signInWithPassword` com timeout de 15 segundos:

```text
const loginWithTimeout = Promise.race([
  supabase.auth.signInWithPassword({ email, password }),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), 15000)
  )
]);
```

No catch de TIMEOUT, mostrar toast "Servidor lento, tente novamente".

**Arquivo 2: `src/pages/global-admin/GlobalAdminAuth.tsx`**

Duas correcoes:
1. Adicionar timeout de 15s ao `signIn`
2. Garantir que `setIsSubmitting(false)` SEMPRE execute, mesmo no caminho de sucesso (usar `finally`)

```text
try {
  // ... login logic
} catch {
  toast.error("Erro ao fazer login");
} finally {
  setIsSubmitting(false); // SEMPRE reseta
}
```

**Arquivo 3: `src/hooks/useAuth.tsx`**

No `handleSessionExpired`, limpar tokens corrompidos do localStorage para evitar loops de refresh:

```text
// Limpar tokens invalidos antes de signOut
try {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.includes('sb-') && key.includes('auth-token')) {
      localStorage.removeItem(key);
    }
  });
} catch (e) {}
```

Tambem adicionar protecao no `getSession` catch para nao ficar preso em loop quando o refresh token esta invalido.

### Resultado Esperado

1. Login mostra erro apos 15 segundos se o servidor estiver lento (em vez de ficar travado)
2. Botao "Entrando..." volta ao estado "Entrar" sempre, mesmo apos sucesso
3. Sessoes com refresh token invalido sao limpas automaticamente, permitindo novo login
4. Tela de fmoadv mostra botao "Tentar novamente" apos 10s (ja implementado) e permite recarregar

