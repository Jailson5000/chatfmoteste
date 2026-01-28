
# Correção Definitiva: Overlay Órfão no Modal de Convite

## Problema Identificado

O clique no nome do departamento **fecha o Dialog parcialmente**, deixando só o overlay visível (tela escura). Isso acontece porque:

1. O Radix Dialog detecta o clique como "interação externa" e dispara `onOpenChange(false)`
2. O conteúdo do modal fecha, mas o overlay permanece na tela
3. Os handlers `onInteractOutside` e `onPointerDownOutside` não estão impedindo o dismiss corretamente porque:
   - O Radix usa `CustomEvent` com `detail.originalEvent`
   - A verificação `.contains(target)` falha porque o target do evento customizado pode não corresponder corretamente ao elemento clicado

## Solução

Usar **`onPointerDownCapture`** diretamente no container da lista de departamentos para interceptar o evento **na fase de captura** (antes que chegue ao Radix). Isso é mais confiável que tentar bloquear o dismiss depois.

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/admin/InviteMemberDialog.tsx` | Adicionar `onPointerDownCapture={(e) => e.stopPropagation()}` no container da lista |

### Mudanças Específicas

**1. Container da lista de departamentos (linha 231-234):**

**ANTES:**
```tsx
<div 
  ref={deptListRef}
  className="h-[150px] border rounded-md p-3 overflow-y-auto overscroll-contain"
>
```

**DEPOIS:**
```tsx
<div 
  ref={deptListRef}
  className="h-[150px] border rounded-md p-3 overflow-y-auto overscroll-contain"
  onPointerDownCapture={(e) => e.stopPropagation()}
>
```

**2. Simplificar os handlers do DialogContent:**

Remover `onInteractOutside` e `onPointerDownOutside` do DialogContent, já que não estão funcionando corretamente. A proteção via `onPointerDownCapture` na lista é suficiente.

**ANTES:**
```tsx
<DialogContent
  className="sm:max-w-[500px]"
  onInteractOutside={handleInteractOutside}
  onPointerDownOutside={handlePointerDownOutside}
>
```

**DEPOIS:**
```tsx
<DialogContent className="sm:max-w-[500px]">
```

**3. Remover código morto:**

Remover as funções `getRadixOriginalTarget`, `handleInteractOutside`, e `handlePointerDownOutside` que não estão mais em uso.

### Por que `onPointerDownCapture` funciona

```text
Fluxo de eventos DOM:

1. Usuário clica no nome do departamento
2. [CAPTURA] onPointerDownCapture no div da lista → stopPropagation() 
3. O evento PARA aqui - nunca chega ao Radix DismissableLayer
4. O Dialog NÃO fecha
5. O onClick normal da linha do departamento executa → toggle funciona ✅

Sem onPointerDownCapture:
1. Usuário clica no nome do departamento
2. Evento sobe pelo DOM
3. Radix DismissableLayer detecta "pointerdown fora do conteúdo primário"
4. Dialog fecha → overlay órfão ❌
```

### Código Final (Seção Relevante)

```tsx
{requiresDepartments && (
  <div className="space-y-2">
    <Label className="flex items-center gap-2">
      Departamentos *
      <Badge variant="secondary" className="text-xs">
        {selectedDepartments.length} selecionado{selectedDepartments.length !== 1 ? "s" : ""}
      </Badge>
    </Label>
    <div 
      ref={deptListRef}
      className="h-[150px] border rounded-md p-3 overflow-y-auto overscroll-contain"
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      {/* Lista de departamentos */}
    </div>
  </div>
)}
```

## Checklist de Testes

1. **Configurações → Membros → Convidar membro**
2. Selecionar **Atendente**
3. Testar cliques em:
   - [ ] Checkbox → deve funcionar
   - [ ] Bolinha colorida → deve funcionar  
   - [ ] Nome do departamento (texto) → deve funcionar
   - [ ] Espaço vazio na linha → deve funcionar
4. Verificar:
   - [ ] NÃO aparece "overlay órfão" (tela escura travada)
   - [ ] Modal NÃO fecha sozinho
   - [ ] Contador "X selecionados" atualiza corretamente
   - [ ] Botão X e Cancelar fecham normalmente
   - [ ] Scroll na lista funciona

## Risco

**Mínimo** - A alteração usa API padrão do DOM (`onPointerDownCapture`), não depende de comportamentos específicos do Radix, e é isolada ao container da lista de departamentos.
