
# Remoção da Funcionalidade "Acessar como Cliente" (Impersonation)

## Resumo

Remoção segura do sistema de impersonation que não está funcionando corretamente devido a limitações de redirect do Supabase Auth com subdomínios dinâmicos.

---

## Componentes a Remover/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/hooks/useImpersonation.tsx` | **DELETAR** | Hook completo de impersonation |
| `src/components/layout/ImpersonationBanner.tsx` | **DELETAR** | Banner amarelo de impersonation |
| `src/components/layout/AppLayout.tsx` | **MODIFICAR** | Remover import e uso do ImpersonationBanner |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | **MODIFICAR** | Remover botão "Acessar como Cliente", estado e import |
| `src/components/auth/ProtectedRoute.tsx` | **MODIFICAR** | Remover lógica de redirect cross-domain para impersonation |
| `supabase/functions/impersonate-user/` | **DELETAR** | Edge Function de impersonation |

---

## O Que NÃO Será Removido (Manter Segurança)

| Componente | Motivo para Manter |
|------------|-------------------|
| `src/pages/TenantMismatch.tsx` | Página de segurança crítica que bloqueia acesso a subdomínios errados |
| `useTenant` hook | Controle de isolamento multi-tenant |
| Validação de subdomain no `ProtectedRoute` | Segurança de tenant - cada cliente só acessa seu subdomain |
| Tabela `impersonation_logs` | Mantém histórico para auditoria (dados já inseridos) |

---

## Detalhes das Modificações

### 1. `src/components/auth/ProtectedRoute.tsx`

**Remover:**
- `useState` para `isRedirectingImpersonation`
- `useEffect` que detecta parâmetro `impersonating` na URL
- Condição de loading para redirecionamento de impersonation

**Manter intacto:**
- Todas as verificações de autenticação
- Validação de `approval_status`
- Validação de trial expirado
- Validação de subdomain (CRÍTICO para segurança multi-tenant)
- Verificação de `mustChangePassword`

### 2. `src/components/layout/AppLayout.tsx`

**Antes:**
```tsx
import { ImpersonationBanner } from "./ImpersonationBanner";
// ...
<ImpersonationBanner />
```

**Depois:**
```tsx
// Remover import e uso do ImpersonationBanner
```

### 3. `src/pages/global-admin/GlobalAdminCompanies.tsx`

**Remover:**
- Import: `import { startImpersonationAction } from "@/hooks/useImpersonation";`
- Import do ícone `LogIn` (se não usado em outro lugar)
- Estado: `const [impersonatingCompany, setImpersonatingCompany] = useState<string | null>(null);`
- Bloco do DropdownMenuItem "Acessar como Cliente" (linhas ~1442-1457)
- DropdownMenuSeparator antes do botão

### 4. Edge Function `impersonate-user`

**Ação:** Deletar a pasta `supabase/functions/impersonate-user/`

---

## Verificação de Segurança Pós-Remoção

A segurança multi-tenant permanece **100% funcional**:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  SEGURANÇA MULTI-TENANT (MANTIDA)                                                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ProtectedRoute.tsx continua com:                                                        │
│                                                                                          │
│  1. ✓ Verificação de autenticação                                                       │
│  2. ✓ Verificação de approval_status (pending/rejected)                                 │
│  3. ✓ Verificação de trial expirado                                                     │
│  4. ✓ Validação de subdomain - CRÍTICO                                                  │
│     - Se company_subdomain existe:                                                       │
│       → Bloqueia acesso ao main domain                                                   │
│       → Bloqueia acesso a subdomain errado                                              │
│       → Exibe TenantMismatch.tsx                                                        │
│  5. ✓ Verificação de mustChangePassword                                                 │
│                                                                                          │
│  RLS do Banco (84 tabelas, 210+ políticas):                                             │
│  ✓ Todas as queries filtram por law_firm_id                                             │
│  ✓ Nenhuma alteração necessária                                                         │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Código Final do ProtectedRoute (Após Limpeza)

```typescript
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyApproval } from "@/hooks/useCompanyApproval";
import { useTenant } from "@/hooks/useTenant";
import PendingApproval from "@/pages/PendingApproval";
import CompanyBlocked from "@/pages/CompanyBlocked";
import TenantMismatch from "@/pages/TenantMismatch";
import TrialExpired from "@/pages/TrialExpired";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, mustChangePassword } = useAuth();
  const { approval_status, rejection_reason, company_subdomain, trial_type, trial_ends_at, trial_expired, plan_name, loading: approvalLoading } = useCompanyApproval();
  const { subdomain: currentSubdomain, isMainDomain, isLoading: tenantLoading } = useTenant();

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while checking company approval status and tenant
  if (approvalLoading || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  // BLOCK: Company pending approval
  if (approval_status === 'pending_approval') {
    return <PendingApproval />;
  }

  // BLOCK: Company rejected
  if (approval_status === 'rejected') {
    return <CompanyBlocked reason={rejection_reason || undefined} />;
  }

  // BLOCK: Trial expired
  if (trial_type && trial_type !== 'none' && trial_expired) {
    console.log('[ProtectedRoute] Blocking: Trial expired at', trial_ends_at);
    return <TrialExpired trialEndsAt={trial_ends_at || undefined} planName={plan_name || undefined} />;
  }

  // TENANT SUBDOMAIN VALIDATION (SEGURANÇA CRÍTICA)
  if (company_subdomain) {
    if (isMainDomain) {
      console.log('[ProtectedRoute] Blocking: User must access via subdomain', company_subdomain);
      return <TenantMismatch expectedSubdomain={company_subdomain} currentSubdomain={null} />;
    }
    
    if (currentSubdomain && currentSubdomain !== company_subdomain) {
      console.log('[ProtectedRoute] Blocking: Wrong subdomain. Expected:', company_subdomain, 'Current:', currentSubdomain);
      return <TenantMismatch expectedSubdomain={company_subdomain} currentSubdomain={currentSubdomain} />;
    }
  }

  // Redirect to change password if flag is set
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  // ALLOW: All security checks passed
  return <>{children}</>;
}
```

---

## Checklist de Validação Pós-Remoção

- [ ] Login normal de clientes funciona
- [ ] Clientes só acessam seu próprio subdomain
- [ ] TenantMismatch.tsx aparece se tentar acessar subdomain errado
- [ ] GlobalAdmin pode ver lista de empresas normalmente
- [ ] Nenhum erro no console relacionado a impersonation
- [ ] Layout do AppLayout funciona sem o banner

---

## Tabela do Banco (impersonation_logs)

**Decisão:** Manter a tabela `impersonation_logs` no banco por:
1. Pode conter dados históricos de tentativas anteriores
2. Útil para auditoria se reativarmos a funcionalidade no futuro
3. Não causa overhead (sem triggers ou dependências)

Se quiser remover no futuro, basta criar uma migration:
```sql
DROP TABLE IF EXISTS public.impersonation_logs;
```
