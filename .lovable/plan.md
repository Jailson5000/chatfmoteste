
# Correções: Departamentos e Alertas de Tarefas

## Análise Detalhada dos Problemas

### Problema 1: Falta opção "Sem Departamento" na configuração de Atendente

**Localização:** `src/pages/Settings.tsx` (linhas 711-759)

**Situação Atual:**
Na tela de edição de permissões de um membro atendente, só aparecem os departamentos **ativos** da empresa. Não existe a opção de marcar "Sem departamento" como área de acesso.

**Impacto:**
Quando um atendente é configurado sem nenhum departamento selecionado, a lógica atual em `useConversations` e `useClients` **automaticamente** dá acesso a conversas/clientes "Sem departamento" (pois `!conv.department_id` retorna `true`).

Isso significa:
- Se o atendente tem `departmentIds = []` (nenhum marcado), ele vê todas as conversas sem departamento
- Mas o admin não pode **controlar explicitamente** se o atendente pode ou não ver "Sem departamento"

**Solução:**
Adicionar um checkbox especial "Sem Departamento" na lista de departamentos ao editar um atendente. Esse checkbox controla se o atendente pode ver conversas/clientes que não estão em nenhum departamento.

Para isso, precisamos:
1. Usar um ID especial (ex: `"__no_department__"`) para representar "Sem departamento"
2. Salvar esse ID junto com os outros na tabela `member_departments`
3. Atualizar a lógica de filtragem para verificar se o atendente tem esse ID especial

---

### Problema 2: Confirmação sobre Tarefas Concluídas e Alertas

**Localização:** `supabase/functions/process-task-due-alerts/index.ts` (linha 108)

**Status: ✅ CORRETO - Não precisa de correção**

A query na Edge Function já inclui o filtro:
```sql
.neq("status", "done")
```

Isso significa que tarefas com status `"done"` (concluídas) **não são selecionadas** e, portanto, **não recebem alertas de vencimento**.

O fluxo está correto:
1. A Edge Function busca apenas tarefas onde `status != 'done'`
2. Tarefas concluídas são ignoradas automaticamente
3. Não há necessidade de correção

---

## Mudanças Necessárias

### Arquivo: `src/pages/Settings.tsx`

**Adicionar opção "Sem Departamento" no dialog de edição:**

Na seção onde os departamentos são listados (aproximadamente linhas 717-758), adicionar um checkbox especial antes dos departamentos ativos:

```tsx
// Antes dos departamentos ativos, adicionar:
<div 
  className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50 border-b pb-2 mb-2"
  onClick={() => {
    const NO_DEPT = "__no_department__";
    setEditMemberDepts(prev => 
      prev.includes(NO_DEPT) 
        ? prev.filter(id => id !== NO_DEPT)
        : [...prev, NO_DEPT]
    );
  }}
>
  <Checkbox checked={editMemberDepts.includes("__no_department__")} />
  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
  <span className="text-sm font-medium">Sem Departamento</span>
</div>
```

### Arquivo: `src/hooks/useUserDepartments.tsx`

**Exportar constante e ajustar retorno:**

```tsx
// Constante pública para "Sem departamento"
export const NO_DEPARTMENT_ID = "__no_department__";
```

### Arquivo: `src/hooks/useConversations.tsx`

**Atualizar lógica de filtragem para considerar permissão explícita:**

```tsx
// Importar constante
import { useUserDepartments, NO_DEPARTMENT_ID } from "@/hooks/useUserDepartments";

// Na filtragem (linha ~250):
const canSeeNoDepartment = userDeptIds.includes(NO_DEPARTMENT_ID);

return allConversations.filter(conv => {
  // Conversa sem departamento: só vê se tem permissão explícita
  if (!conv.department_id) {
    return canSeeNoDepartment || conv.assigned_to === userId;
  }
  // Conversa com departamento: precisa ter acesso ao dept ou ser assigned
  return userDeptIds.includes(conv.department_id) || conv.assigned_to === userId;
});
```

### Arquivo: `src/hooks/useClients.tsx`

**Aplicar a mesma lógica:**

```tsx
import { useUserDepartments, NO_DEPARTMENT_ID } from "@/hooks/useUserDepartments";

const canSeeNoDepartment = userDeptIds.includes(NO_DEPARTMENT_ID);

return allClients.filter(client => {
  if (!client.department_id) {
    return canSeeNoDepartment || client.assigned_to === userId;
  }
  return userDeptIds.includes(client.department_id) || client.assigned_to === userId;
});
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Settings.tsx` | Adicionar checkbox "Sem Departamento" no dialog de edição de membro |
| `src/hooks/useUserDepartments.tsx` | Exportar constante `NO_DEPARTMENT_ID` |
| `src/hooks/useConversations.tsx` | Ajustar filtro para verificar permissão explícita de "Sem departamento" |
| `src/hooks/useClients.tsx` | Mesma correção do filtro |

---

## Comportamento Após Correção

**Cenário: Gabrielle (atendente)**

| Configuração | Comportamento Esperado |
|--------------|------------------------|
| Apenas "CLIENTES FMO" marcado | Vê apenas conversas/clientes em "CLIENTES FMO" + atribuídas a ela |
| "CLIENTES FMO" + "Sem Departamento" marcados | Vê conversas/clientes em "CLIENTES FMO" + sem departamento + atribuídas a ela |
| Nenhum marcado | Vê apenas conversas/clientes atribuídas diretamente a ela |
| Apenas "Sem Departamento" marcado | Vê apenas conversas/clientes sem departamento + atribuídas a ela |

---

## Sobre Tarefas Concluídas

**Confirmado:** Tarefas com `status === "done"` **não recebem alertas**. A Edge Function já tem o filtro `.neq("status", "done")` na linha 108, garantindo que tarefas concluídas são excluídas da lista de alertas.

---

## Garantias de Não-Regressão

1. **Compatibilidade retroativa**: Atendentes existentes sem o ID especial continuarão a não ver conversas sem departamento (comportamento mais restritivo)
2. **Admin/Gerente**: Continuam com acesso total, sem mudanças
3. **Tarefas**: Sistema de alertas continua funcionando normalmente
4. **Outras áreas**: Nenhuma modificação em chat, agenda, agentes de IA, etc.
