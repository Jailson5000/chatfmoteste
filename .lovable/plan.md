

# Plano: Sistema de Suspensão de Empresas por Inadimplência

## Resumo da Funcionalidade

Adicionar a capacidade de **suspender** e **liberar** empresas inadimplentes diretamente no painel Global Admin. Quando suspensa, a empresa:
- Não acessa o sistema normalmente
- Vê apenas uma tela com link de pagamento
- Pode regularizar a situação pagando

---

## Arquitetura Atual

| Componente | Status Atual |
|------------|--------------|
| Coluna `companies.status` | Existe com valores `active`, `trial`, `suspended`, `cancelled` |
| `ProtectedRoute` | Verifica `approval_status` e `trial_expired`, mas **NÃO** verifica `status='suspended'` |
| `CompanyBlocked.tsx` | Página para `approval_status='rejected'` - foco em "não aprovado" |
| `TrialExpired.tsx` | Página com link de pagamento - modelo ideal para reutilizar |

---

## Mudanças Planejadas

### 1. Banco de Dados

**Adicionar campos para rastrear suspensão:**

```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_by uuid;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_reason text;

COMMENT ON COLUMN companies.suspended_at IS 'Data em que a empresa foi suspensa por inadimplência';
COMMENT ON COLUMN companies.suspended_by IS 'Admin que suspendeu a empresa';
COMMENT ON COLUMN companies.suspended_reason IS 'Motivo da suspensão (ex: Inadimplência desde 01/02/2026)';
```

---

### 2. Nova Página: `src/pages/CompanySuspended.tsx`

Criar página dedicada para empresas suspensas por inadimplência, similar à `TrialExpired.tsx`:

**Características:**
- Ícone de alerta (diferente do "rejeitado")
- Título: "Acesso Suspenso por Pendência Financeira"
- Exibe motivo da suspensão (se houver)
- **Botão principal**: "Pagar Agora" → chama `generate-payment-link`
- **Botões secundários**: Email/WhatsApp para suporte
- **Botão**: "Sair da conta"

```text
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                          [Ícone de Cadeado]                         │
│                                                                     │
│                   Acesso Suspenso Temporariamente                   │
│                                                                     │
│      Identificamos uma pendência financeira na sua conta.           │
│      Regularize seu pagamento para liberar o acesso.                │
│                                                                     │
│      ┌─────────────────────────────────────────────────────────┐    │
│      │ Motivo: Inadimplência desde 01/02/2026                  │    │
│      └─────────────────────────────────────────────────────────┘    │
│                                                                     │
│            ┌───────────────────────────────────────────┐            │
│            │  💳 Pagar Agora - R$ 497,00/mês           │            │
│            └───────────────────────────────────────────┘            │
│                                                                     │
│            [ Falar com Suporte por Email ]                          │
│            [ Falar pelo WhatsApp ]                                  │
│                                                                     │
│                        Sair da conta                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 3. Atualizar `ProtectedRoute.tsx`

Adicionar verificação de `status='suspended'` logo após as verificações de approval:

```typescript
// BLOCK: Company suspended for non-payment
if (company_status === 'suspended') {
  return <CompanySuspended reason={suspended_reason} planName={plan_name} planPrice={plan_price} />;
}
```

**Ordem das verificações:**
1. ✅ Autenticação
2. ✅ `approval_status === 'pending_approval'` → PendingApproval
3. ✅ `approval_status === 'rejected'` → CompanyBlocked
4. 🆕 `status === 'suspended'` → **CompanySuspended**
5. ✅ Trial expirado → TrialExpired
6. ✅ Subdomain validation → TenantMismatch
7. ✅ Must change password → /change-password

---

### 4. Atualizar `useCompanyApproval.tsx`

Adicionar campos de status de suspensão:

```typescript
interface CompanyApprovalStatus {
  // ... campos existentes ...
  company_status: 'active' | 'trial' | 'suspended' | 'cancelled' | null;
  suspended_reason: string | null;
}
```

E buscar esses campos na query:

```typescript
.select(`
  approval_status, 
  rejection_reason, 
  name, 
  status,           // ← ADICIONAR
  suspended_reason, // ← ADICIONAR
  trial_type,
  ...
`)
```

---

### 5. Atualizar `GlobalAdminCompanies.tsx`

Adicionar opções no **dropdown de ações** de cada empresa:

```text
┌────────────────────────────────┐
│  ✏️  Editar                    │
│  ⚙️  Configurar Domínio        │
│  🤖 Configurar IA              │
│  👥 Ver Usuários               │
│  🔑 Resetar Senha Admin        │
├────────────────────────────────┤
│  💳 Gerar Cobrança Stripe      │
│  🔒 Suspender Empresa    🆕    │  ← Vermelho (só se status != suspended)
│  🔓 Liberar Empresa      🆕    │  ← Verde (só se status == suspended)
├────────────────────────────────┤
│  🗑️  Excluir                   │
└────────────────────────────────┘
```

**Comportamento:**
- **Suspender**: Abre dialog de confirmação com campo para motivo
- **Liberar**: Atualiza `status='active'`, limpa `suspended_at/by/reason`

---

### 6. Componente: `SuspendCompanyDialog.tsx`

Dialog de confirmação com:
- Nome da empresa
- Campo para motivo da suspensão (pré-preenchido com data de vencimento se disponível)
- Botão "Cancelar" / "Confirmar Suspensão"

```text
┌─────────────────────────────────────────────────────────────────────┐
│  🔒 Suspender Empresa                                         [X]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Tem certeza que deseja suspender a empresa "MiauChat Demo"?        │
│                                                                     │
│  A empresa não terá acesso ao sistema até que o pagamento seja      │
│  regularizado e você libere manualmente.                            │
│                                                                     │
│  Motivo da suspensão:                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Inadimplência - Vencimento: 08/02/2026                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ⚠️ O cliente verá apenas a tela de pagamento quando tentar         │
│     acessar o sistema.                                              │
│                                                                     │
│                         [ Cancelar ]  [ Suspender ]                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 7. Atualizar Hook `useCompanies.tsx`

Adicionar mutations para suspender e liberar:

```typescript
const suspendCompany = useMutation({
  mutationFn: async ({ companyId, reason }: { companyId: string; reason?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("companies")
      .update({
        status: 'suspended',
        suspended_at: new Date().toISOString(),
        suspended_by: user?.id,
        suspended_reason: reason || 'Inadimplência',
      })
      .eq("id", companyId);

    if (error) throw error;
  },
  // ...
});

const unsuspendCompany = useMutation({
  mutationFn: async (companyId: string) => {
    const { error } = await supabase
      .from("companies")
      .update({
        status: 'active',
        suspended_at: null,
        suspended_by: null,
        suspended_reason: null,
      })
      .eq("id", companyId);

    if (error) throw error;
  },
  // ...
});
```

---

## Fluxo Completo

```text
┌─────────────────────────────────────────────────────────────────────┐
│  1. Admin Global detecta inadimplência                              │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Global Admin > Empresas > [...] > "Suspender Empresa"           │
│     - Insere motivo: "Inadimplência desde 08/02/2026"               │
│     - Confirma suspensão                                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Banco atualiza:                                                  │
│     - status = 'suspended'                                           │
│     - suspended_at = now()                                           │
│     - suspended_by = admin_user_id                                   │
│     - suspended_reason = "Inadimplência..."                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. Usuário da empresa tenta acessar                                │
│     - ProtectedRoute detecta status='suspended'                      │
│     - Mostra CompanySuspended.tsx com link de pagamento              │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
         ┌──────────────────────┐    ┌──────────────────────┐
         │ Cliente paga via     │    │ Cliente contata      │
         │ botão "Pagar Agora"  │    │ suporte              │
         └──────────────────────┘    └──────────────────────┘
                    │                           │
                    ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. Admin Global > Empresas > [...] > "Liberar Empresa"             │
│     - Confirma liberação                                             │
│     - status = 'active', suspended_* = null                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. Usuário acessa normalmente o sistema                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Indicador Visual no Global Admin

Na tabela de empresas, quando `status='suspended'`:
- Badge vermelho: "Suspensa"
- Tooltip: "Suspensa em DD/MM/YYYY - Motivo: X"

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| **Migração SQL** | Criar | Adicionar colunas `suspended_at`, `suspended_by`, `suspended_reason` |
| `src/pages/CompanySuspended.tsx` | **Criar** | Nova página para empresas suspensas |
| `src/hooks/useCompanyApproval.tsx` | Modificar | Adicionar `company_status`, `suspended_reason` |
| `src/components/auth/ProtectedRoute.tsx` | Modificar | Verificar `status='suspended'` |
| `src/hooks/useCompanies.tsx` | Modificar | Adicionar `suspendCompany`, `unsuspendCompany` |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | Modificar | Adicionar opções de menu + dialog |
| `src/components/global-admin/SuspendCompanyDialog.tsx` | **Criar** | Dialog de confirmação de suspensão |

---

## Risco de Quebrar o Sistema

**Baixo:**

1. **Migração SQL**: Apenas adiciona colunas nullable - não afeta dados existentes
2. **ProtectedRoute**: Adiciona verificação adicional - verificações existentes continuam funcionando
3. **useCompanyApproval**: Adiciona campos extras à query - compatível com código atual
4. **GlobalAdminCompanies**: Adiciona itens ao dropdown - funcionalidades existentes intactas
5. **Backward compatible**: Empresas com `status='active'` (todas atualmente) não são afetadas

---

## Validações Pós-Implementação

- [ ] Suspender empresa no Global Admin → status muda para 'suspended'
- [ ] Usuário da empresa suspensa vê tela de pagamento ao acessar
- [ ] Botão "Pagar Agora" redireciona para Stripe corretamente
- [ ] Liberar empresa no Global Admin → status volta para 'active'
- [ ] Usuário liberado consegue acessar o sistema normalmente
- [ ] Badge "Suspensa" aparece corretamente na listagem
- [ ] Outras funcionalidades (trial, approval, etc.) continuam funcionando

