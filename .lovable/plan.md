

# Remover Duplicação: "Arquivado / Finalizado"

## Problema Identificado

Na tela de **Editar Permissões** de um membro atendente, existe uma duplicação:

1. ✅ **Checkbox especial** "Arquivados / Finalizados" (linha 775-794 do Settings.tsx) - correto
2. ❌ **Departamento real** "Arquivado / Finalizado" vindo da lista `activeDepartments` - duplicado

A causa é que existe um departamento real no banco de dados com esse nome (ID: `1a077748-d2b8-4bb5-9e36-97322a0e5b8f`), que foi criado antes da implementação da permissão especial.

---

## Solução

Filtrar da lista de departamentos qualquer departamento cujo nome contenha "arquivado" ou "finalizado" (case insensitive), já que a permissão de acesso a arquivados agora é controlada pelo checkbox especial.

### Alteração em `src/pages/Settings.tsx`

Na linha 703, onde definimos `activeDepartments`:

**Antes:**
```tsx
const activeDepartments = departments?.filter(d => d.is_active) || [];
```

**Depois:**
```tsx
const activeDepartments = departments?.filter(d => {
  if (!d.is_active) return false;
  // Exclude "Arquivado/Finalizado" department - now controlled by special permission
  const nameLower = d.name.toLowerCase();
  if (nameLower.includes('arquivado') || nameLower.includes('finalizado')) {
    return false;
  }
  return true;
}) || [];
```

---

## Análise das Modificações Anteriores

### ✅ Banco de Dados
- Tabela `member_department_access` criada corretamente
- Colunas `can_access_no_department` e `can_access_archived` funcionando
- RPCs `get_member_no_department_access_for_user` e `get_member_archived_access_for_user` criadas

### ✅ Hook `useUserDepartments.tsx`
- Retorna `canAccessArchived` corretamente
- Compõe `departmentIds` incluindo `NO_DEPARTMENT_ID` quando permitido
- Roles com acesso total (admin/gerente/advogado/estagiario) sempre podem ver arquivados

### ✅ Hook `useTeamMembers.tsx`
- Tipo `TeamMember` inclui `can_access_no_department` e `can_access_archived`
- Mutation `updateMemberAccessFlags` salva ambas as permissões
- Filtra `NO_DEPARTMENT_ID` antes de inserir em `member_departments`

### ✅ Página `Conversations.tsx`
- Botão de arquivados escondido para quem não tem permissão

### ✅ Página `Kanban.tsx`
- Coluna "Arquivado / Finalizado" escondida para quem não tem permissão

### ✅ Página `Settings.tsx`
- Checkboxes "Sem Departamento" e "Arquivados / Finalizados" funcionando
- Salvamento das permissões especiais funcionando
- **⚠️ Único problema**: Lista de departamentos inclui o departamento real "Arquivado / Finalizado"

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Settings.tsx` | Filtrar departamentos com nome contendo "arquivado" ou "finalizado" |

---

## Resultado Esperado

O dialog de permissões mostrará:
1. ☐ **Sem Departamento** (permissão especial)
2. ☐ **Arquivados / Finalizados** (permissão especial)
3. ☐ Atendimento
4. ☐ Documentação Recebida
5. ☐ Analisando
6. ☐ Jurídico - Protocolo
7. ☐ CLIENTES FMO
8. ❌ ~~Arquivado / Finalizado~~ (removido da lista)

---

## Garantias de Não-Regressão

1. **Filtro aplicado apenas no dialog de permissões**: Não afeta outras áreas do sistema
2. **Departamento continua existindo**: Apenas não aparece na lista de seleção
3. **Conversas já atribuídas**: Continuam visíveis normalmente no Kanban pela lógica de arquivados
4. **Outras empresas**: Não afetadas (cada uma tem seus próprios departamentos)

