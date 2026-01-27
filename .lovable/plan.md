
# Plano: Melhorias Completas no Modulo de Tarefas

## Resumo

Implementar edicao completa de tarefas (titulo, descricao, data, responsaveis), menu de acoes rapidas nos cards Kanban, e gestao completa de categorias (criar, editar, excluir) - tudo em uma interface intuitiva e profissional.

---

## Funcionalidades a Implementar

### 1. Edicao de Tarefa no TaskDetailSheet

| Campo | Tipo de Edicao | Interacao |
|-------|----------------|-----------|
| Titulo | Input inline | Click para editar, blur para salvar |
| Descricao | Textarea inline | Click para editar, botoes salvar/cancelar |
| Data de Vencimento | Date Picker | Popover com calendario + limpar |
| Responsaveis | Multi-select Popover | Checkboxes com busca |

### 2. Menu de Acoes Rapidas no Card Kanban

Menu de 3 pontos com:
- Alterar Status (A Fazer, Em Progresso, Concluido)
- Alterar Prioridade (Baixa, Media, Alta, Urgente)
- Excluir (com confirmacao)

### 3. Gestao de Categorias

Novo componente/dialog para:
- Listar categorias existentes
- Criar nova categoria (nome + cor)
- Editar categoria (nome + cor)
- Excluir categoria
- Acessivel via botao de configuracoes na pagina de Tarefas

---

## Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| src/components/tasks/TaskCategoriesDialog.tsx | Dialog para gerenciar categorias |
| src/components/tasks/EditableAssigneesPopover.tsx | Popover para editar responsaveis |

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| src/components/tasks/TaskDetailSheet.tsx | Adicionar edicao inline de titulo, descricao, data e responsaveis |
| src/components/tasks/TaskKanbanCard.tsx | Adicionar menu dropdown de acoes rapidas |
| src/pages/Tasks.tsx | Adicionar botao de configuracoes para gerenciar categorias |

---

## Implementacao Detalhada

### TaskDetailSheet - Edicao de Titulo

Transformar o titulo em campo editavel:
- Exibe como texto normal com icone de lapis ao hover
- Ao clicar, transforma em Input
- Salva automaticamente ao perder foco (onBlur)
- Feedback visual de salvamento

### TaskDetailSheet - Edicao de Descricao

Adicionar modo de edicao:
- Exibe descricao atual ou "Clique para adicionar descricao"
- Ao clicar, abre Textarea editavel
- Botoes Salvar/Cancelar abaixo
- Suporte a texto longo com scroll

### TaskDetailSheet - Edicao de Data

Substituir exibicao simples por Date Picker:
- Se tem data: mostra data com botao de editar
- Se nao tem: mostra "Adicionar data de vencimento"
- Popover com calendario para selecionar
- Botao "Limpar" para remover data

### TaskDetailSheet - Edicao de Responsaveis

Novo componente EditableAssigneesPopover:
- Botao "Editar" ao lado do titulo "Responsaveis"
- Popover com lista de membros da equipe
- Checkboxes para selecionar/deselecionar
- Campo de busca por nome
- Salva automaticamente ao fechar

### TaskKanbanCard - Menu de Acoes

Adicionar DropdownMenu (3 pontos) no canto superior direito:
- Submenu Status: A Fazer, Em Progresso, Concluido
- Submenu Prioridade: Baixa, Media, Alta, Urgente
- Separador
- Excluir (abre AlertDialog de confirmacao)

### TaskCategoriesDialog - Gestao de Categorias

Dialog completo para gerenciar categorias:
- Lista de categorias com cor e nome
- Botao "Nova Categoria" no topo
- Cada categoria tem botoes Editar/Excluir
- Dialog de edicao usa ColorPicker existente
- Confirmacao ao excluir

### Tasks.tsx - Botao de Configuracoes

Adicionar botao ao lado do header:
- Icone de engrenagem (Settings)
- Abre TaskCategoriesDialog
- Tooltip "Gerenciar Categorias"

---

## Fluxo Visual

```text
+-------------------------------------------+
|  TAREFAS                    [+Nova] [⚙️]  |  <-- Botao config abre dialog categorias
+-------------------------------------------+
|                                           |
|  +-------------+  +-------------+         |
|  |  A Fazer    |  | Em Progresso|         |
|  +-------------+  +-------------+         |
|  | [Card] [⋮]  |  |             |         |  <-- Menu 3 pontos no card
|  | [Card] [⋮]  |  |             |         |
|  +-------------+  +-------------+         |
+-------------------------------------------+

Ao clicar no card -> TaskDetailSheet:
+-------------------------------------------+
|  [✏️ Titulo editavel]                     |  <-- Click para editar
|  Criado em 27/01/2026                     |
+-------------------------------------------+
|  Status: [Select]  Prioridade: [Select]   |
|  Categoria: [Select]                      |
|                                           |
|  📅 Vencimento: 30/01/2026 [Editar]       |  <-- Date Picker
|                                           |
|  Descricao                                |
|  [Clique para editar descricao...]        |  <-- Click abre textarea
|                                           |
|  Responsaveis [Editar]                    |  <-- Abre popover
|  [Avatar1] [Avatar2] [Avatar3]            |
+-------------------------------------------+
```

---

## Componentes Reutilizados

- ColorPicker (ja existe em src/components/ui/color-picker.tsx)
- EditableItem (padrao similar para categorias)
- Dialog, Popover, Button, Input, Textarea (shadcn/ui)
- Calendar (DatePicker)
- DropdownMenu

---

## Hooks Utilizados

| Hook | Uso |
|------|-----|
| useTasks | updateTask.mutate para todas as edicoes |
| useTaskCategories | createCategory, updateCategory, deleteCategory |
| useTeamMembers | Lista de membros para popover de responsaveis |

O hook useTasks ja suporta:
- updateTask com title, description, due_date, assignee_ids
- Todos os campos necessarios ja estao implementados

O hook useTaskCategories ja suporta:
- createCategory (name, color)
- updateCategory (id, name, color)
- deleteCategory (id)

---

## Sequencia de Implementacao

| Fase | Descricao | Risco |
|------|-----------|-------|
| 1 | TaskDetailSheet - Edicao de titulo inline | Baixo |
| 2 | TaskDetailSheet - Edicao de descricao | Baixo |
| 3 | TaskDetailSheet - Edicao de data | Baixo |
| 4 | EditableAssigneesPopover - Componente | Medio |
| 5 | TaskDetailSheet - Integrar popover de responsaveis | Baixo |
| 6 | TaskKanbanCard - Menu de acoes rapidas | Baixo |
| 7 | TaskCategoriesDialog - Novo componente | Medio |
| 8 | Tasks.tsx - Botao de configuracoes | Baixo |

---

## Detalhes Tecnicos

### Edicao Inline de Titulo

```typescript
const [isEditingTitle, setIsEditingTitle] = useState(false);
const [editedTitle, setEditedTitle] = useState(task.title);

const handleSaveTitle = () => {
  if (editedTitle.trim() && editedTitle !== task.title) {
    updateTask.mutate({ id: task.id, title: editedTitle.trim() });
  }
  setIsEditingTitle(false);
};

// No render:
{isEditingTitle ? (
  <Input
    value={editedTitle}
    onChange={(e) => setEditedTitle(e.target.value)}
    onBlur={handleSaveTitle}
    onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
    autoFocus
  />
) : (
  <h2 onClick={() => setIsEditingTitle(true)} className="cursor-pointer group">
    {task.title}
    <Pencil className="opacity-0 group-hover:opacity-100" />
  </h2>
)}
```

### Popover de Responsaveis

```typescript
const [selectedIds, setSelectedIds] = useState(task.assignees.map(a => a.user_id));

const handleToggle = (userId: string) => {
  setSelectedIds(prev => 
    prev.includes(userId) 
      ? prev.filter(id => id !== userId)
      : [...prev, userId]
  );
};

const handleSave = () => {
  updateTask.mutate({ id: task.id, assignee_ids: selectedIds });
  setOpen(false);
};
```

### Menu de Acoes no Card

```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem onClick={() => handleStatusChange("todo")}>A Fazer</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("in_progress")}>Em Progresso</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("done")}>Concluido</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    // ... priority submenu
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Testes de Regressao

1. **Edicao de Tarefa**
   - Editar titulo e verificar salvamento
   - Editar descricao longa
   - Alterar e limpar data de vencimento
   - Adicionar/remover responsaveis

2. **Kanban**
   - Drag-and-drop continua funcionando
   - Menu de acoes executa corretamente
   - Cards atualizam apos alteracao

3. **Categorias**
   - Criar nova categoria
   - Editar nome e cor
   - Excluir categoria
   - Tarefas com categoria excluida ficam sem categoria

4. **Navegacao**
   - Click no card abre detalhes
   - ESC fecha modais
   - Filtros continuam funcionando

---

## Garantias de Nao-Regressao

1. Hook useTasks ja suporta todos os campos (title, description, due_date, assignee_ids)
2. Hook useTaskCategories ja tem CRUD completo
3. Componentes shadcn/ui sao estaveis
4. ColorPicker ja existe e funciona
5. Invalidacao de queries ja configurada nos hooks
6. Activity log registra todas as alteracoes automaticamente
