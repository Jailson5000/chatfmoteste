

# Correção: Alinhar InviteMemberDialog com o padrão funcional de Settings.tsx

## Diagnóstico Final

O `div#root` fica **completamente vazio** após o clique - isso indica um crash total do React. A causa é:

1. **`onPointerDownCapture` no container** - Interceptar na fase de captura pode quebrar o gerenciamento interno de estado do Radix Dialog
2. **Estrutura diferente do modal que funciona** - O modal de edição em `Settings.tsx` (linhas 720-751) funciona sem problemas usando uma abordagem diferente

## Diferenças Identificadas

| Aspecto | Settings.tsx (funciona) | InviteMemberDialog (quebra) |
|---------|------------------------|----------------------------|
| Container | Sem handlers especiais | `onPointerDownCapture` no container |
| Cada linha | `onPointerDown={(e) => e.stopPropagation()}` | `role="button"`, `tabIndex={0}`, `onKeyDown` |
| Checkbox | `onClick` + `onPointerDown` com stopPropagation | Igual |

## Solução

Copiar exatamente o padrão que funciona em Settings.tsx:

### Mudanças em `src/components/admin/InviteMemberDialog.tsx`:

**1. Remover `onPointerDownCapture` do container (linha 208):**

```tsx
// ANTES
<div 
  ref={deptListRef}
  className="h-[150px] border rounded-md p-3 overflow-y-auto overscroll-contain"
  onPointerDownCapture={(e) => e.stopPropagation()}
>

// DEPOIS
<div 
  ref={deptListRef}
  className="h-[150px] border rounded-md p-3 overflow-y-auto overscroll-contain"
>
```

**2. Simplificar cada linha de departamento (linhas 217-239):**

```tsx
// ANTES
<div
  key={dept.id}
  role="button"
  tabIndex={0}
  className="flex w-full select-none items-center space-x-3 rounded-md p-2 text-left cursor-pointer hover:bg-muted/50"
  onClick={() => handleDepartmentToggle(dept.id)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleDepartmentToggle(dept.id);
    }
  }}
>
  <Checkbox ... />

// DEPOIS (idêntico ao Settings.tsx)
<div 
  key={dept.id} 
  className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50"
  onClick={(e) => {
    e.stopPropagation();
    handleDepartmentToggle(dept.id);
  }}
  onPointerDown={(e) => e.stopPropagation()}
>
  <Checkbox ... />
```

**3. Remover ref não utilizado:**

O `deptListRef` não é mais necessário, pode ser removido.

## Por que isso funciona

```text
Settings.tsx (funciona):
1. Clique na linha
2. onPointerDown -> stopPropagation (bloqueia evento antes de bubble)
3. onClick -> stopPropagation + toggle
4. Radix NÃO detecta "outside click"
5. Dialog permanece aberto ✅

InviteMemberDialog com onPointerDownCapture (quebra):
1. Clique na linha
2. [CAPTURA] Container intercepta TODOS os eventos
3. stopPropagation na fase de captura pode quebrar listeners internos do Radix
4. Estado do Radix fica inconsistente
5. React crash → div#root vazio ❌
```

## Código Final da Lista de Departamentos

```tsx
{requiresDepartments && (
  <div className="space-y-2">
    <Label className="flex items-center gap-2">
      Departamentos *
      <Badge variant="secondary" className="text-xs">
        {selectedDepartments.length} selecionado{selectedDepartments.length !== 1 ? "s" : ""}
      </Badge>
    </Label>
    <div className="h-[150px] border rounded-md p-3 overflow-y-auto overscroll-contain">
      {departments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhum departamento cadastrado
        </p>
      ) : (
        <div className="space-y-2">
          {departments.filter((d) => d.is_active).map((dept) => (
            <div 
              key={dept.id} 
              className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50"
              onClick={(e) => {
                e.stopPropagation();
                handleDepartmentToggle(dept.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Checkbox 
                checked={selectedDepartments.includes(dept.id)}
                onCheckedChange={() => handleDepartmentToggle(dept.id)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <div className="w-3 h-3 flex-shrink-0 rounded-full" style={{ backgroundColor: dept.color }} />
              <span className="text-sm">{dept.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    <p className="text-xs text-muted-foreground">
      O Atendente só terá acesso às conversas dos departamentos selecionados
    </p>
  </div>
)}
```

## Checklist de Testes

1. **Configurações → Membros → Convidar membro**
2. Selecionar **Atendente**
3. Clicar no:
   - [ ] Checkbox → funciona
   - [ ] Nome do departamento → funciona SEM crash
   - [ ] Bolinha colorida → funciona
4. Verificar:
   - [ ] Página NÃO fica preta
   - [ ] Modal NÃO fecha sozinho
   - [ ] Contador atualiza

5. **Teste de regressão - Editar membro existente**
   - [ ] Confirmar que edição ainda funciona

## Risco

**Baixo** - Estamos copiando exatamente o padrão que já funciona em outra parte do sistema.

