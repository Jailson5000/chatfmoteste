

# Correção: Status não aparecem todos no Painel Lateral de Conversas

## Problema Identificado

O **dropdown de Status no cabeçalho** (componente `ContactStatusTags`) mostra **todos os 10+ status**, enquanto o **painel lateral direito** (componente `ContactDetailsPanel`) mostra apenas **5 status**.

## Causa Raiz

A diferença está na forma como cada componente obtém os dados:

| Componente | Como obtém Status | Resultado |
|------------|-------------------|-----------|
| `ContactStatusTags` (cabeçalho) | `useCustomStatuses()` direto + `.filter(s => s.is_active)` | ✅ Todos os status ativos |
| `ContactDetailsPanel` (painel lateral) | Recebe via **props** de `Conversations.tsx` | ❌ Apenas 5 status |

O `ContactDetailsPanel` depende de dados passados pela página `Conversations.tsx`, que pode estar com o cache do TanStack Query desatualizado ou com algum problema de timing.

## Solução Proposta

**Modificar o `ContactDetailsPanel` para usar diretamente os hooks**, eliminando a dependência de props para status, departamentos e tags. Isso garante que ele sempre tenha os dados mais recentes, igual ao `ContactStatusTags`.

### Alterações

**Arquivo:** `src/components/conversations/ContactDetailsPanel.tsx`

1. **Importar hooks diretamente:**
```typescript
import { useCustomStatuses } from "@/hooks/useCustomStatuses";
import { useDepartments } from "@/hooks/useDepartments";
import { useTags } from "@/hooks/useTags";
```

2. **Usar hooks dentro do componente:**
```typescript
export function ContactDetailsPanel({
  conversation,
  // Remover: departments, tags, statuses das props
  members,
  automations,
  // ...
}: ContactDetailsPanelProps) {
  const queryClient = useQueryClient();
  
  // Usar hooks diretos - mesmo padrão do ContactStatusTags
  const { statuses: allStatuses } = useCustomStatuses();
  const { departments: allDepartments } = useDepartments();
  const { tags: allTags } = useTags();
  
  // Filtrar ativos
  const statuses = allStatuses.filter(s => s.is_active);
  const departments = allDepartments.filter(d => d.is_active);
  const tags = allTags; // Tags não tem is_active
  
  // ... resto do componente
}
```

3. **Atualizar a interface `ContactDetailsPanelProps`:**
   - Remover `departments`, `tags`, `statuses` da interface

4. **Atualizar `Conversations.tsx`:**
   - Remover a passagem dessas props para `ContactDetailsPanel`

## Fluxo Após a Correção

```text
┌─────────────────────────────────────────────────────────────────┐
│           ContactDetailsPanel é renderizado                     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  useCustomStatuses() → Query com cache do TanStack Query        │
│  useDepartments() → Mesmo cache que ContactStatusTags           │
│  useTags() → Dados sempre sincronizados                         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│        TODOS os status/departments/tags aparecem                │
│        (idêntico ao comportamento do cabeçalho)                 │
└─────────────────────────────────────────────────────────────────┘
```

## Vantagens da Solução

1. **Consistência**: Ambos os componentes usam a mesma fonte de dados
2. **Atualização automática**: Mudanças via Realtime são refletidas imediatamente
3. **Menos props**: Simplifica a interface do componente
4. **Cache compartilhado**: TanStack Query gerencia um único cache para todos

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/conversations/ContactDetailsPanel.tsx` | Usar hooks diretamente em vez de props |
| `src/pages/Conversations.tsx` | Remover props desnecessárias |

## Verificação de Não-Regressão

- As funções `onChangeStatus`, `onChangeTags`, `onChangeDepartment` continuam funcionando (já existem)
- O filtro `is_active` é aplicado dentro do componente (igual ao cabeçalho)
- Não afeta a lógica de seleção ou salvamento

## Risco

**Baixo** - A mudança alinha o comportamento com um padrão já em uso (`ContactStatusTags`) e simplifica a passagem de dados.

