# ✅ IMPLEMENTADO: Permissão "Arquivado/Finalizado" para Atendentes

## Alterações Realizadas

### 1. Banco de Dados
- Adicionada coluna `can_access_archived` na tabela `member_department_access`
- Criada RPC `get_member_archived_access_for_user` para buscar a permissão

### 2. Hooks Atualizados
- **useTeamMembers.tsx**: Adicionado `can_access_archived` ao tipo e mutations
- **useUserDepartments.tsx**: Retorna `canAccessArchived: boolean`

### 3. UI
- **Settings.tsx**: Checkbox "Arquivados/Finalizados" no dialog de permissões do atendente
- **Conversations.tsx**: Botão de arquivados escondido se atendente não tem permissão
- **Kanban.tsx**: Coluna "Finalizados" escondida se atendente não tem permissão

## Comportamento

| Configuração | Pode Ver Arquivados |
|--------------|---------------------|
| Admin/Gerente | ✅ Sempre |
| Atendente com `can_access_archived = false` | ❌ Não |
| Atendente com `can_access_archived = true` | ✅ Sim |
