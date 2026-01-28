
# Correção da Tela Preta em Configurações > Membros

## Problema Identificado

A funcionalidade de edição de permissões de membros apresenta uma **tela preta** ao interagir com a seleção de departamentos. Isso ocorre devido a:

1. **Múltiplos Dialogs dentro do loop de tabela**: Cada linha de membro renderiza seu próprio `Dialog` com overlay escuro (`bg-black/80`), o que pode causar sobreposição de backdrops
2. **Departamentos não filtrados**: O código não filtra departamentos inativos (`is_active`), diferente do `InviteMemberDialog` que faz isso corretamente
3. **Possível problema de estado**: Quando o Dialog é aberto com estado inicial incorreto

## Solução Proposta

### 1. Extrair o Dialog de Edição para Fora do Loop

Mover o Dialog de edição de membros para **fora do loop** `teamMembers.map()`, usando estado para controlar qual membro está sendo editado.

```text
ANTES:
┌──────────────────────────────────────────────┐
│ teamMembers.map((member) => (                │
│   <TableRow>                                 │
│     ...                                      │
│     <Dialog> ← Dialog DENTRO do loop         │
│       <DialogContent>...</DialogContent>     │
│     </Dialog>                                │
│   </TableRow>                                │
│ ))                                           │
└──────────────────────────────────────────────┘

DEPOIS:
┌──────────────────────────────────────────────┐
│ teamMembers.map((member) => (                │
│   <TableRow>                                 │
│     ...                                      │
│     <Button onClick={() => openEdit(member)} │
│   </TableRow>                                │
│ ))                                           │
│                                              │
│ {/* Dialog FORA do loop */}                  │
│ <Dialog open={editingMember !== null}>       │
│   <DialogContent>...</DialogContent>         │
│ </Dialog>                                    │
└──────────────────────────────────────────────┘
```

### 2. Filtrar Departamentos Inativos

```typescript
// ANTES (linha 705):
{departments.map(dept => (

// DEPOIS:
{departments.filter(d => d.is_active).map(dept => (
```

### 3. Adicionar Validação de Segurança

```typescript
// Adicionar fallback para array de departamentos
const activeDepartments = departments?.filter(d => d.is_active) || [];

// Validar antes de renderizar checkboxes
{activeDepartments.length > 0 ? (
  activeDepartments.map(dept => ...)
) : (
  <p className="text-sm text-muted-foreground">Nenhum departamento cadastrado</p>
)}
```

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Settings.tsx` | Refatorar estrutura do Dialog e filtrar departamentos |

## Mudanças Detalhadas

### Settings.tsx - Estrutura do Dialog de Edição

1. **Remover o Dialog de dentro do `map()`** (linhas 659-769)
2. **Criar um Dialog único controlado fora da tabela**
3. **Adicionar estado para armazenar o membro selecionado para edição**

```typescript
// Estado para membro em edição (já existe, mas será usado diferente)
const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

// Na tabela, apenas o botão de abrir
<Button 
  variant="ghost" 
  size="sm"
  onClick={() => {
    setEditingMember(member);
    setEditMemberRole(member.role);
    setEditMemberDepts(member.department_ids || []);
  }}
>
  <Pencil className="h-3 w-3 mr-1" />
  Editar
</Button>

// Dialog fora do loop
<Dialog 
  open={editingMember !== null} 
  onOpenChange={(open) => !open && setEditingMember(null)}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Editar Permissões - {editingMember?.full_name}</DialogTitle>
    </DialogHeader>
    {/* Conteúdo do form */}
  </DialogContent>
</Dialog>
```

### Filtragem de Departamentos

```typescript
// Garantir que apenas departamentos ativos sejam exibidos
const activeDepartments = departments?.filter(d => d.is_active) || [];

{editMemberRole === "atendente" && (
  <div className="space-y-2">
    <Label>Departamentos com acesso</Label>
    <p className="text-xs text-muted-foreground mb-2">
      Atendente não pode: modificar configurações, conexões ou automações.
    </p>
    <div className="space-y-2 border rounded-lg p-3 max-h-[200px] overflow-y-auto">
      {activeDepartments.length > 0 ? (
        activeDepartments.map(dept => (
          <label key={dept.id} className="flex items-center gap-2 cursor-pointer">
            <Checkbox 
              checked={editMemberDepts.includes(dept.id)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setEditMemberDepts(prev => [...prev, dept.id]);
                } else {
                  setEditMemberDepts(prev => prev.filter(id => id !== dept.id));
                }
              }}
            />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
            <span className="text-sm">{dept.name}</span>
          </label>
        ))
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          Nenhum departamento cadastrado
        </p>
      )}
    </div>
  </div>
)}
```

## Resultado Esperado

1. **Tela preta eliminada**: Apenas um Dialog com um único overlay será renderizado
2. **Departamentos corretos**: Apenas departamentos ativos serão exibidos
3. **Comportamento estável**: Estado controlado corretamente sem conflitos

## Testes de Validação

1. Abrir a aba "Membros" em Configurações
2. Clicar em "Editar" em qualquer membro
3. Alterar a função para "Atendente"
4. Verificar que os checkboxes de departamentos funcionam sem tela preta
5. Selecionar/desselecionar departamentos
6. Salvar e confirmar que as alterações foram aplicadas

## Risco

**Baixo** - A alteração melhora a estrutura do código sem modificar a lógica de negócio. Mantém compatibilidade total com o fluxo existente.
