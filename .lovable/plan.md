
## Diagnóstico (por que acontece o erro)

O erro do print (“invalid input syntax for type uuid: '__no_department__'”) acontece porque:

- A tabela **`member_departments.department_id`** é do tipo **UUID** e tem FK para `departments(id)`.
- A UI passou a usar o valor especial **`"__no_department__"`** para representar “Sem Departamento”.
- Ao salvar, o código tenta **inserir `"__no_department__"`** em `member_departments.department_id`, e o banco rejeita (não é UUID).

Ou seja: a ideia de “Sem Departamento” como um “ID fake” precisa ser armazenada **fora** da tabela `member_departments`.

---

## Objetivo da correção

1) Continuar exibindo “Sem Departamento” para marcar/desmarcar na tela de permissões do atendente.  
2) Persistir essa permissão no backend sem quebrar constraints/UUID/FKs.  
3) Manter a filtragem atual (atendente só vê “sem departamento” quando tiver permissão explícita), sem regressão para admin/gerente.

---

## Solução (sem regressão e alinhada ao modelo atual)

### A) Backend (Lovable Cloud) — criar uma tabela própria para “Sem Departamento”

Criar uma tabela dedicada, por exemplo:

**`member_department_access`**
- `id uuid primary key default gen_random_uuid()`
- `member_id uuid not null references profiles(id) on delete cascade unique`
- `can_access_no_department boolean not null default false`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()` (com trigger `update_updated_at_column` já existente no projeto)

**RLS (mesma filosofia do projeto):**
- Admin do tenant pode **gerenciar** (ALL) registros de membros do seu escritório.
- O próprio membro pode **ler** seu registro (SELECT) para o app aplicar filtro.
- (Opcional) Global admin (`is_admin(auth.uid())`) pode ler/gerenciar.

**RPC auxiliar (opcional, recomendado para simplificar o front):**
- `get_member_no_department_access_for_user(_user_id uuid) returns boolean`
  - Retorna `coalesce(can_access_no_department, false)`
  - Restringe leitura: apenas o próprio usuário ou admin/global admin.

> Importante: **não** mexer na tabela `member_departments` para guardar “Sem Departamento”.

---

### B) Frontend — impedir insert do ID fake e salvar corretamente

#### 1) `src/hooks/useTeamMembers.tsx`
Ajustar o `updateMemberDepartments` para:
- **filtrar** o array antes de inserir:
  - `realDepartmentIds = departmentIds.filter(id => id !== NO_DEPARTMENT_ID)`
- assim nunca tenta inserir `"__no_department__"` em `member_departments`.

Criar uma nova mutation:
- `updateMemberNoDepartmentAccess({ memberId, canAccessNoDepartment })`
  - faz **upsert** em `member_department_access` (insert on conflict member_id do update)

No carregamento dos membros (`queryFn`), além de `member_departments`, buscar também `member_department_access` e montar no retorno:
- `can_access_no_department: boolean`

E no `TeamMember` retornar:
- `department_ids: string[]` (somente UUIDs)
- `can_access_no_department: boolean`

#### 2) `src/pages/Settings.tsx`
Ajustar o fluxo do dialog “Editar Permissões”:

- Manter o checkbox “Sem Departamento” (como hoje).
- Ao abrir o modal (`Editar`):
  - inicializar `editMemberDepts` com:
    - `member.department_ids`
    - + `NO_DEPARTMENT_ID` se `member.can_access_no_department === true`

- Ao salvar:
  - `canAccessNoDepartment = editMemberDepts.includes(NO_DEPARTMENT_ID)`
  - `realDepartmentIds = editMemberDepts.filter(id => id !== NO_DEPARTMENT_ID)`

  Executar:
  1. `updateMemberDepartments({ memberId, departmentIds: realDepartmentIds })`
  2. `updateMemberNoDepartmentAccess({ memberId, canAccessNoDepartment })`

Isso elimina o erro e persiste corretamente a permissão.

#### 3) `src/hooks/useUserDepartments.tsx`
Hoje o hook assume que `NO_DEPARTMENT_ID` estaria vindo da lista de departamentos (RPC de `member_departments`), mas isso não vai funcionar.

Atualizar o hook para:
- Buscar `departmentIds` (UUIDs) via RPC existente `get_member_department_ids_for_user`
- Buscar `canAccessNoDepartment` via:
  - RPC nova `get_member_no_department_access_for_user` (recomendado), ou
  - query direta na tabela nova
- Montar `departmentIdsFinal`:
  - `uuidDeptIds + (canAccessNoDepartment ? [NO_DEPARTMENT_ID] : [])`

Assim, **não precisa mudar** a lógica atual de filtro em:
- `src/hooks/useConversations.tsx`
- `src/hooks/useClients.tsx`
porque elas já usam `userDeptIds.includes(NO_DEPARTMENT_ID)`.

#### 4) Ajuste visual (opcional, mas melhora auditoria)
Na lista de membros (Settings > Membros), quando mostrar badges de departamentos:
- se `can_access_no_department` for true, mostrar uma badge “Sem Departamento”.

---

## Testes (para garantir que não regrediu)

1) Como admin:
- Abrir **Configurações > Membros**
- Editar atendente
- Marcar “Sem Departamento” + 1 departamento real
- Salvar
- Confirmar que **não aparece** mais o erro de UUID.

2) Logar como atendente (ou usar um usuário atendente real):
- Verificar que:
  - Conversas/Clientes **Sem Departamento** aparecem somente quando a permissão foi marcada.
  - Se desmarcar “Sem Departamento”, itens com `department_id = null` **somem** (exceto os `assigned_to` dele, como já implementado).

3) Validar que admin/gerente continuam vendo tudo (sem impacto).

---

## Sobre tarefas concluídas e alertas (confirmação)
A função `process-task-due-alerts` já contém:
- `.neq("status", "done")`

Então **tarefas concluídas (“done”) não recebem alerta**. Nenhuma mudança necessária aqui (apenas manter e, se quiser, validar que o status usado para concluído no sistema é realmente `"done"`).

---

## Entregáveis (o que será alterado)

### Banco (migration)
- Criar `member_department_access`
- Criar triggers e políticas RLS
- (Opcional) criar RPC `get_member_no_department_access_for_user`

### Código
- `src/hooks/useTeamMembers.tsx` (filtrar NO_DEPARTMENT_ID + nova mutation + carregar flag)
- `src/pages/Settings.tsx` (salvar separado: dept UUIDs vs permissão “Sem Departamento”)
- `src/hooks/useUserDepartments.tsx` (compor `departmentIds` incluindo NO_DEPARTMENT_ID via flag persistida)

Isso corrige o erro atual, mantém o controle explícito da permissão e preserva a regra de restrição já implementada, sem regressão no resto do sistema.
