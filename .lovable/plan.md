

# Remover Seleção de Departamentos da Criação de Membros

## Objetivo

Separar a funcionalidade conforme solicitado:
- **Criação**: Apenas nome, email e perfil (sem departamentos)
- **Edição**: Configurar departamentos (já funciona em Settings.tsx)

## Benefícios

1. **Resolve o bug de crash** - Remove completamente o código problemático da lista de checkboxes
2. **Fluxo mais limpo** - Criar primeiro, configurar depois
3. **Consistência** - Todos os membros são criados da mesma forma

## Mudanças em `src/components/admin/InviteMemberDialog.tsx`

### 1. Remover imports não utilizados

```tsx
// REMOVER
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useDepartments } from "@/hooks/useDepartments";
```

### 2. Remover a flag `requiresDepartments` dos roles

```tsx
// ANTES
const roles = [
  { value: "atendente", ..., requiresDepartments: true },
];

// DEPOIS
const roles = [
  { value: "atendente", ..., requiresDepartments: false }, // ou remover a propriedade
];
```

### 3. Remover estado e lógica de departamentos

```tsx
// REMOVER
const { departments } = useDepartments();
const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
const selectedRole = roles.find(r => r.value === role);
const requiresDepartments = selectedRole?.requiresDepartments ?? false;
const handleDepartmentToggle = ...
```

### 4. Remover validação de departamentos no submit

```tsx
// REMOVER
if (requiresDepartments && selectedDepartments.length === 0) {
  setError("Selecione pelo menos um departamento para o Atendente");
  return;
}
```

### 5. Simplificar envio

```tsx
// ANTES
departmentIds: requiresDepartments ? selectedDepartments : [],

// DEPOIS
departmentIds: [], // Sempre vazio na criação
```

### 6. Remover toda a seção de UI de departamentos (linhas 194-236)

Remover o bloco:
```tsx
{requiresDepartments && (
  <div className="space-y-2">
    <Label>Departamentos *</Label>
    ...
  </div>
)}
```

### 7. Atualizar descrição do perfil Atendente

```tsx
// ANTES
description: "Acesso apenas aos departamentos selecionados",

// DEPOIS  
description: "Acesso restrito - configure departamentos após criação",
```

## Resultado Final

O modal de convite terá apenas:
- Nome Completo
- Email
- Perfil de Acesso (Admin, Gerente, Supervisor, Atendente)
- Mensagem de credenciais automáticas

## Fluxo do Usuário

1. Clica "Convidar Membro"
2. Preenche nome, email, seleciona "Atendente"
3. Clica "Enviar Convite"
4. Membro é criado
5. Na lista de membros, clica "Editar"
6. Seleciona os departamentos no dialog de edição (já funciona)

## Checklist de Testes

1. **Criar atendente**
   - [ ] Modal abre sem crash
   - [ ] NÃO aparece seleção de departamentos
   - [ ] Consegue criar atendente normalmente

2. **Editar atendente** (já funciona)
   - [ ] Clica em Editar
   - [ ] Aparece seleção de departamentos
   - [ ] Consegue marcar/desmarcar sem crash
   - [ ] Salva corretamente

## Risco

**Mínimo** - Estamos apenas removendo código, não adicionando complexidade.

