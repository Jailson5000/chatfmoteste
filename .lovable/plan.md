

# Adicionar Permissão "Arquivado/Finalizado" para Atendentes

## Objetivo

Adicionar um segundo checkbox de permissão especial na configuração de membros atendentes, permitindo que o admin defina se o atendente pode ou não ver conversas arquivadas/finalizadas.

---

## Arquitetura da Solução

A implementação segue exatamente o mesmo padrão já usado para "Sem Departamento":

```text
┌─────────────────────────────────────────────────────────────┐
│              TABELA: member_department_access               │
├─────────────────────────────────────────────────────────────┤
│  member_id (uuid) - FK para profiles                        │
│  can_access_no_department (boolean) - existente             │
│  can_access_archived (boolean) - NOVO                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   useUserDepartments                        │
├─────────────────────────────────────────────────────────────┤
│  departmentIds: [...uuids, NO_DEPARTMENT_ID?]               │
│  canAccessArchived: boolean - NOVO                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             FILTRAGEM (hooks/components)                    │
├─────────────────────────────────────────────────────────────┤
│  useConversationsFilters → bloqueia aba "archived" se false │
│  Kanban → esconde coluna "Finalizados" se false             │
└─────────────────────────────────────────────────────────────┘
```

---

## Mudanças Detalhadas

### 1. Migração de Banco de Dados

Adicionar coluna `can_access_archived` à tabela existente:

```sql
ALTER TABLE public.member_department_access 
ADD COLUMN can_access_archived boolean NOT NULL DEFAULT false;

-- Atualizar RPC para incluir nova coluna
CREATE OR REPLACE FUNCTION public.get_member_archived_access_for_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT can_access_archived FROM member_department_access WHERE member_id = _user_id),
    false
  )
$$;
```

### 2. Hook `useTeamMembers.tsx`

- Adicionar `can_access_archived` ao tipo `TeamMember`
- Carregar a nova coluna na query de membros
- Atualizar `updateMemberNoDepartmentAccess` para também aceitar `canAccessArchived`

### 3. Hook `useUserDepartments.tsx`

- Adicionar nova query para buscar `can_access_archived`
- Retornar `canAccessArchived: boolean` no resultado

### 4. Página `Settings.tsx`

- Adicionar checkbox "Arquivados/Finalizados" no dialog de edição de atendente
- Carregar e salvar a nova permissão junto com as outras

### 5. Hook `useConversationsFilters.tsx`

- Receber `canAccessArchived` via props ou hook
- Bloquear aba "archived" se atendente não tiver permissão

### 6. Página `Kanban.tsx`

- Verificar `canAccessArchived` do hook `useUserDepartments`
- Esconder coluna "Finalizados" se atendente não tiver permissão

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/migrations/` | Nova migração: adicionar coluna + RPC |
| `src/hooks/useTeamMembers.tsx` | Adicionar `can_access_archived` ao tipo e mutations |
| `src/hooks/useUserDepartments.tsx` | Buscar e retornar `canAccessArchived` |
| `src/pages/Settings.tsx` | Adicionar checkbox "Arquivados/Finalizados" |
| `src/pages/Conversations/hooks/useConversationsFilters.tsx` | Bloquear aba archived |
| `src/pages/Kanban.tsx` | Esconder coluna Finalizados |

---

## Comportamento Após Correção

| Configuração do Atendente | Pode Ver Arquivados |
|---------------------------|---------------------|
| `can_access_archived = false` (padrão) | ❌ Não vê aba "Arquivados" nem coluna "Finalizados" |
| `can_access_archived = true` | ✅ Vê aba "Arquivados" e coluna "Finalizados" |

---

## UI no Dialog de Permissões

O dialog terá dois checkboxes especiais antes da lista de departamentos:

1. ☐ **Sem Departamento** - permite ver conversas sem departamento
2. ☐ **Arquivados/Finalizados** - permite ver conversas arquivadas

---

## Garantias de Não-Regressão

1. **Admin/Gerente**: Continuam com acesso total (incluindo arquivados)
2. **Atendentes existentes**: Padrão `false` = não veem arquivados (comportamento mais restritivo por segurança)
3. **Sem mudança de lógica base**: Apenas adição de novo filtro condicional

