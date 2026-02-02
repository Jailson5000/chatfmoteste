
# Plano: Corrigir Exclusão Completa de Empresa no Admin Global

## Diagnóstico

### Situação Atual
Quando você "apaga" uma empresa no Admin Global, o sistema:

| O que acontece | Status |
|----------------|--------|
| Deleta `companies` | ✅ Sim (se não tiver erros de FK) |
| Deleta `law_firms` | ❌ **NÃO** |
| Deleta usuários `auth.users` | ❌ **NÃO** |
| Limpa `profiles` | ❌ **NÃO** |
| Deleta n8n workflow | ✅ Sim |

### Dados Órfãos Encontrados para `miautest03@gmail.com`

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ auth.users                                                              │
│   id: 7406c011-90f7-40b7-86a7-338b790bf2d8                              │
│   email: miautest03@gmail.com                                           │
│   created_at: 2026-01-28 (5 dias atrás - registro anterior!)            │
├─────────────────────────────────────────────────────────────────────────┤
│ profiles                                                                │
│   id: 7406c011-90f7-40b7-86a7-338b790bf2d8                              │
│   law_firm_id: NULL (foi desvinculado, mas não deletado)                │
├─────────────────────────────────────────────────────────────────────────┤
│ law_firms (AINDA EXISTE!)                                               │
│   id: 6403c3c5-b8ea-4999-9ffb-16f49f414baa                              │
│   name: "Miau test"                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│ companies (AINDA EXISTE!)                                               │
│   id: 93e0ce06-44fd-4d94-a727-38c6aca52d9c                              │
│   name: "Miau test"                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Nota importante:** O usuário foi criado em 28/01, antes do trial de 02/02. Isso significa que houve uma tentativa anterior de registro.

---

## Solução Proposta

### Criar uma Edge Function dedicada: `delete-company-full`

Esta função fará a exclusão completa e segura:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ delete-company-full (Nova Edge Function)                                │
│                                                                          │
│ Entrada: company_id, delete_users: boolean                              │
│                                                                          │
│ Passos:                                                                  │
│ 1. Validar que chamador é super_admin                                   │
│ 2. Buscar company e law_firm_id                                         │
│ 3. Deletar n8n workflow (se existir)                                    │
│ 4. Listar todos profiles vinculados ao law_firm                         │
│ 5. Se delete_users=true:                                                │
│    - Para cada profile: deletar de auth.users via admin API             │
│ 6. Deletar company (CASCADE deleta company_subscriptions, addon_requests)│
│ 7. Deletar law_firm (CASCADE deleta todas as 80+ tabelas relacionadas)  │
│ 8. Criar audit log                                                       │
│ 9. Retornar resumo da limpeza                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Exclusão

```text
law_firms → ON DELETE CASCADE → 80+ tabelas (conversas, mensagens, clientes, etc)
         → ON DELETE SET NULL → profiles (desvincula, mas não deleta)

auth.users → Precisa ser deletado via auth.admin.deleteUser()
          → Automaticamente deleta o profile vinculado
```

---

## Alterações Necessárias

### 1. Nova Edge Function: `supabase/functions/delete-company-full/index.ts`

```typescript
// Pseudocódigo
serve(async (req) => {
  // Validar super_admin
  const { company_id, delete_users = true } = await req.json();
  
  // Buscar company e law_firm
  const company = await supabase.from('companies').select('*, law_firm:law_firms(*)').eq('id', company_id).single();
  
  // Deletar n8n workflow
  if (company.n8n_workflow_id) { ... }
  
  // Listar usuários do law_firm
  const profiles = await supabase.from('profiles').select('id').eq('law_firm_id', company.law_firm_id);
  
  // Deletar usuários do auth (opcional)
  if (delete_users) {
    for (const profile of profiles) {
      await supabaseAdmin.auth.admin.deleteUser(profile.id);
    }
  }
  
  // Deletar law_firm (CASCADE deleta company e todas as outras tabelas)
  await supabase.from('law_firms').delete().eq('id', company.law_firm_id);
  
  // Audit log
  await supabase.from('audit_logs').insert({ action: 'COMPANY_FULL_DELETE', ... });
  
  return { success: true, deleted_users: profiles.length };
});
```

### 2. Atualizar `useCompanies.tsx`

Modificar `deleteCompany` para chamar a nova Edge Function em vez de deletar só a company.

---

## Limpeza Imediata dos Dados Órfãos

Para limpar os dados existentes de `miautest03@gmail.com`, podemos usar as ferramentas já existentes:

### Opção 1: Usar `purge-user-by-email` (já existe!)

Esta Edge Function já existe e faz:
- Deleta de `member_departments`
- Deleta de `user_roles`
- Deleta de `profiles`
- Deleta de `admin_user_roles`
- Deleta de `admin_profiles`
- Deleta do `auth.users`

Mas **NÃO** deleta company/law_firm.

### Opção 2: Deletar manualmente via SQL

Para limpar os dados órfãos atuais:
```sql
-- 1. Deletar law_firm (CASCADE deleta company e ~80 tabelas)
DELETE FROM law_firms WHERE id = '6403c3c5-b8ea-4999-9ffb-16f49f414baa';

-- 2. Deletar usuário do auth (via Edge Function purge-user-by-email)
-- Isso remove auth.users + profiles
```

---

## Resumo das Alterações

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/delete-company-full/index.ts` | **CRIAR** - Nova Edge Function para exclusão completa |
| `src/hooks/useCompanies.tsx` | **MODIFICAR** - Usar nova Edge Function |
| (limpeza manual) | Executar limpeza dos dados órfãos existentes |

---

## Benefícios

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Deleta company | ✅ | ✅ |
| Deleta law_firm | ❌ | ✅ |
| Deleta auth.users | ❌ | ✅ (opcional) |
| Limpa profiles | ❌ | ✅ |
| Audit log | ❌ | ✅ |
| Dados órfãos | Acumulam | Zero |
