
# Correção Final: Clique em Departamentos Causa Tela Preta

## Problema Identificado

O usuário reporta que:
- ✅ Clicar no **checkbox** (quadrado vermelho) funciona
- ❌ Clicar no **texto** ou **bolinha colorida** (área amarela) causa tela preta

### Causa Raiz

O `ScrollArea` do Radix UI pode estar interferindo com o sistema de detecção de "outside click" do `Dialog`. O Radix Dialog usa `onPointerDownOutside` para detectar cliques fora do conteúdo, e o ScrollArea cria um viewport interno que pode não ser reconhecido corretamente como "dentro" do DialogContent.

## Solução

Substituir o `ScrollArea` por um **div nativo** com `overflow-y: auto`, eliminando qualquer interferência do componente Radix ScrollArea com o Dialog.

Esta é a mesma solução já documentada na memória do projeto (`style/sidebar-scrolling-optimization`):
> "Uses native 'div' containers with 'max-h-[60vh]', 'overflow-y-auto', and 'overscroll-contain' for lists. This layout replaces Radix 'ScrollArea' components to prevent scrolling conflicts in nested containers."

## Arquivo Afetado

| Arquivo | Alteração |
|---------|-----------|
| `src/components/admin/InviteMemberDialog.tsx` | Substituir ScrollArea por div nativo |

## Mudanças Específicas

### InviteMemberDialog.tsx

**ANTES:**
```tsx
<ScrollArea className="h-[150px] border rounded-md p-3">
  {departments.length === 0 ? (
    ...
  ) : (
    <div className="space-y-2">
      {departments.filter(d => d.is_active).map((dept) => (
        ...
      ))}
    </div>
  )}
</ScrollArea>
```

**DEPOIS:**
```tsx
<div 
  className="h-[150px] border rounded-md p-3 overflow-y-auto overscroll-contain"
  onPointerDown={(e) => e.stopPropagation()}
>
  {departments.length === 0 ? (
    ...
  ) : (
    <div className="space-y-2">
      {departments.filter(d => d.is_active).map((dept) => (
        ...
      ))}
    </div>
  )}
</div>
```

### Ajustes adicionais no item de departamento:

Garantir que todos os elementos filhos tenham proteção contra propagação:

```tsx
<div
  key={dept.id}
  className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer select-none"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDepartmentToggle(dept.id);
  }}
  onPointerDown={(e) => e.stopPropagation()}
  onMouseDown={(e) => e.stopPropagation()}
>
  <Checkbox ... />
  <div 
    className="w-3 h-3 rounded-full pointer-events-none"
    style={{ backgroundColor: dept.color }}
  />
  <span className="text-sm pointer-events-none">{dept.name}</span>
</div>
```

Adicionamos:
1. `pointer-events-none` na bolinha colorida e no texto para que o clique seja sempre capturado pelo container div
2. `select-none` no container para evitar seleção de texto acidental
3. `onMouseDown` com stopPropagation como fallback adicional

## Por que isso resolve

1. **Div nativo** não cria estruturas internas complexas que podem interferir com o Dialog
2. **pointer-events-none** nos elementos visuais (texto/bolinha) força o clique a ser tratado pelo div pai
3. **stopPropagation em múltiplos eventos** (click, pointerdown, mousedown) garante que nenhum evento "vaze" para o Dialog

## Resultado Esperado

- Clicar no checkbox: ✅ funciona (como antes)
- Clicar no texto do departamento: ✅ funciona
- Clicar na bolinha colorida: ✅ funciona
- Clicar no espaço vazio da linha: ✅ funciona
- Dialog não fecha inesperadamente

## Checklist de Testes

1. Abrir **Convidar Membro**
2. Selecionar **Atendente**
3. Testar cliques em diferentes áreas:
   - [ ] Checkbox diretamente
   - [ ] Texto do departamento
   - [ ] Bolinha colorida
   - [ ] Espaço vazio na linha
4. Verificar que a contagem "X selecionados" atualiza
5. Enviar convite e confirmar funcionamento

## Risco

**Muito baixo** - Apenas substituímos um componente de scroll por equivalente nativo, mantendo toda a lógica de negócio intacta.
