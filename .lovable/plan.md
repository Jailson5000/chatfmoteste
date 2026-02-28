

## Plano: Permitir Super Admin acessar o domínio principal sem redirecionamento

### Problema
O usuário `suporte@miauchat.com.br` é `super_admin` mas também tem `law_firm_id` vinculado a uma empresa com subdomain `suporte`. Quando acessa qualquer rota protegida em `miauchat.com.br`, o `ProtectedRoute` detecta que o `company_subdomain = 'suporte'` e bloqueia o acesso, mostrando a tela `TenantMismatch` que redireciona para `suporte.miauchat.com.br`.

### Solução
Modificar o `ProtectedRoute` para verificar se o usuário é **global admin** (via RPC `is_admin`) e, se for, **bypassar completamente a validação de subdomínio/tenant**.

### Alterações

**Arquivo: `src/components/auth/ProtectedRoute.tsx`**

1. Adicionar query para verificar se o usuário é global admin (reutilizar a query já existente para maintenance mode, expandindo seu escopo)
2. Na seção de **TENANT SUBDOMAIN VALIDATION**, adicionar condição: se `isGlobalAdmin === true`, pular toda a validação de subdomínio

```
// Lógica atual (linha ~148):
if (company_subdomain) {
  if (isMainDomain) { return <TenantMismatch ... /> }
  ...
}

// Nova lógica:
if (company_subdomain && !isGlobalAdmin) {
  if (isMainDomain) { return <TenantMismatch ... /> }
  ...
}
```

3. Ajustar a query `isGlobalAdmin` para sempre executar (remover condição `enabled: isMaintenanceMode`), já que agora é usada também para bypass de tenant

### Impacto
- Super admins podem navegar livremente em `miauchat.com.br` sem serem forçados ao subdomínio
- Usuários normais continuam restritos ao seu subdomínio
- Sem impacto em segurança: a verificação usa `is_admin` RPC (server-side, SECURITY DEFINER)

