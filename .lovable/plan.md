

## Plano: Corrigir race condition no bypass de super admin

### Problema
A query `isGlobalAdmin` retorna `undefined` enquanto carrega. Como `!undefined === true`, a condição `company_subdomain && !isGlobalAdmin` passa como `true` antes do resultado da query chegar, bloqueando o acesso.

### Solução

**Arquivo: `src/components/auth/ProtectedRoute.tsx`**

1. Capturar o estado `isLoading` da query `isGlobalAdmin`:
```typescript
const { data: isGlobalAdmin, isLoading: adminLoading } = useQuery({...});
```

2. Incluir `adminLoading` na tela de "Verificando acesso..." (junto com `approvalLoading` e `tenantLoading`):
```typescript
if (approvalLoading || tenantLoading || adminLoading) {
  return <div>Verificando acesso...</div>;
}
```

Isso garante que o ProtectedRoute só avalia a validação de tenant **depois** que a query de admin resolveu.

### Impacto
- Corrige o bloqueio indevido de super admins no domínio principal
- Adiciona ~1s extra de loading (tempo da query `is_admin`) para todos os usuários — aceitável pois já há loading de approval e tenant

