

# Correção: Atendente com Acesso a Todos os Departamentos

## Problema Identificado

A usuária **Gabrielle** (gabbenm00@gmail.com) está configurada corretamente no banco:
- **Role:** `atendente`
- **Departamento permitido:** `CLIENTES FMO`

Porém, ela consegue ver **todos os departamentos** porque o sistema **não aplica filtragem** com base nos departamentos atribuídos a usuários com role `atendente`.

### Causa Raiz

Os hooks de dados (`useConversations`, `useClients`, `useDepartments`) buscam **todos os dados** do `law_firm_id` sem considerar a role do usuário ou os departamentos aos quais ele tem acesso via tabela `member_departments`.

---

## Solução Proposta

### Arquitetura da Correção

```text
┌─────────────────────────────────────────────────────────────────┐
│                   NOVO HOOK: useUserDepartments                 │
├─────────────────────────────────────────────────────────────────┤
│  • Busca role do usuário logado (user_roles)                    │
│  • Busca departamentos atribuídos (member_departments)          │
│  • Retorna: { role, departmentIds, hasFullAccess, isLoading }   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               HOOKS MODIFICADOS (filtragem aplicada)            │
├─────────────────────────────────────────────────────────────────┤
│  useConversations  → filtra por department_id ou assigned_to    │
│  useClients        → filtra por department_id                   │
│  useDepartments    → retorna apenas departamentos acessíveis    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mudanças Detalhadas

### 1. Criar Hook `useUserDepartments`

**Novo arquivo:** `src/hooks/useUserDepartments.tsx`

```typescript
// Retorna:
interface UserDepartmentsData {
  role: AppRole | null;
  departmentIds: string[];      // IDs dos departamentos que o usuário pode acessar
  hasFullAccess: boolean;       // true para admin/gerente
  isLoading: boolean;
}
```

**Lógica:**
- Se role é `admin` ou `gerente`: `hasFullAccess = true`, não aplica filtro
- Se role é `atendente`: busca `member_departments` e retorna apenas os IDs atribuídos
- Se não tem departamentos atribuídos: não vê nada (lista vazia)

---

### 2. Modificar `useDepartments.tsx`

Atualmente retorna **todos** os departamentos da empresa. Modificar para:

```typescript
// Antes
const { data: departments = [] } = useQuery({
  queryFn: async () => {
    // Busca TODOS os departamentos da law_firm
  }
});

// Depois  
const { hasFullAccess, departmentIds: userDeptIds } = useUserDepartments();

const filteredDepartments = useMemo(() => {
  if (hasFullAccess) return departments;
  return departments.filter(d => userDeptIds.includes(d.id));
}, [departments, hasFullAccess, userDeptIds]);
```

---

### 3. Modificar `useConversations.tsx`

Aplicar filtro após fetch das conversas:

```typescript
const { hasFullAccess, departmentIds: userDeptIds } = useUserDepartments();

// Filtrar conversas no cliente (mais simples que modificar RPC)
const filteredConversations = useMemo(() => {
  if (hasFullAccess) return allConversations;
  
  // Atendente vê:
  // 1. Conversas nos departamentos atribuídos
  // 2. Conversas atribuídas diretamente a ele (assigned_to)
  // 3. Conversas sem departamento (para não bloquear fluxo)
  return allConversations.filter(conv => 
    !conv.department_id ||                       // Sem departamento
    userDeptIds.includes(conv.department_id) ||  // Departamento permitido
    conv.assigned_to === user?.id                // Atribuída ao usuário
  );
}, [allConversations, hasFullAccess, userDeptIds, user?.id]);
```

---

### 4. Modificar `useClients.tsx`

Aplicar mesmo padrão de filtro:

```typescript
const { hasFullAccess, departmentIds: userDeptIds } = useUserDepartments();

const filteredClients = useMemo(() => {
  if (hasFullAccess) return clients;
  
  return clients.filter(client => 
    !client.department_id ||
    userDeptIds.includes(client.department_id) ||
    client.assigned_to === user?.id
  );
}, [clients, hasFullAccess, userDeptIds, user?.id]);
```

---

### 5. Atualizar Páginas que usam esses hooks

Os componentes que usam esses hooks **não precisam mudar** pois a filtragem ocorre internamente. Porém, precisamos garantir que:

- `Kanban.tsx` - Já usa `useDepartments()` e `useConversations()`
- `Conversations.tsx` - Já usa `useDepartments()` e `useConversations()`  
- `Contacts.tsx` - Já usa `useClients()`

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/hooks/useUserDepartments.tsx` | **Criar** | Hook que retorna role e departamentos do usuário |
| `src/hooks/useDepartments.tsx` | Modificar | Filtrar departamentos baseado em acesso |
| `src/hooks/useConversations.tsx` | Modificar | Filtrar conversas baseado em departamentos |
| `src/hooks/useClients.tsx` | Modificar | Filtrar clientes baseado em departamentos |

---

## Regras de Acesso

| Role | Acesso |
|------|--------|
| `admin` | Todos os departamentos e conversas |
| `gerente` | Todos os departamentos e conversas |
| `advogado` | Todos os departamentos e conversas |
| `estagiario` | Todos os departamentos e conversas |
| `atendente` | Apenas departamentos em `member_departments` + conversas atribuídas diretamente |

---

## Comportamento Esperado Após Correção

**Gabrielle (atendente com acesso a "CLIENTES FMO"):**
- ✅ Vê apenas o departamento "CLIENTES FMO" no Kanban
- ✅ Vê apenas conversas do departamento "CLIENTES FMO"
- ✅ Vê conversas atribuídas diretamente a ela (assigned_to)
- ✅ Vê conversas sem departamento (para não bloquear fluxo inicial)
- ❌ Não vê outros departamentos como "Financeiro", "Comercial", etc.

**Jailson (admin):**
- ✅ Continua vendo tudo normalmente

---

## Garantias de Não-Regressão

1. **Compatibilidade:** Admin/Gerente continua com acesso total
2. **Sem mudança de banco:** Apenas filtragem no frontend
3. **Performance:** Filtro em memória após fetch (mínimo impacto)
4. **Fallback seguro:** Se role não encontrada, assume mais restritivo

---

## Fluxo Visual

```text
Usuário loga → useUserDepartments busca role + departamentos
                           │
                           ▼
              ┌────────────────────────┐
              │  role === 'admin' ou   │
              │  role === 'gerente'?   │
              └────────────────────────┘
                    │           │
                   Sim         Não
                    │           │
                    ▼           ▼
            hasFullAccess   Busca member_departments
            = true          para o user_id
                                │
                                ▼
                        departmentIds = [...]
                                │
                                ▼
            Hooks aplicam filtro baseado em departmentIds
```

