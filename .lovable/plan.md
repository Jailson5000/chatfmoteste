
# Plano: Remover Botão de Criar Departamento do Kanban

## Situação Atual

Quando um usuário novo acessa o **Kanban** sem departamentos criados, aparece uma tela vazia com um botão "Criar Departamento":

```
+----------------------------------+
|           📁                     |
|  Nenhum departamento criado      |
|                                  |
|  [  Criar Departamento  ]        |  ← Botão problemático
+----------------------------------+
```

Esse botão usa o componente `CreateDepartmentDialog`, que também existe em **Configurações > Classes > Departamento**.

---

## Problema

- Ter dois lugares para criar departamento confunde os usuários
- O Kanban não é o lugar ideal para configurar departamentos
- Centralizar em Configurações mantém a lógica de configuração organizada

---

## Solução Proposta

Trocar o botão "Criar Departamento" por um botão que **redireciona para Configurações**:

```
+----------------------------------+
|           📁                     |
|  Nenhum departamento criado      |
|  Crie departamentos em           |
|  Configurações para organizar    |
|  suas conversas.                 |
|                                  |
|  [  Ir para Configurações  ]     |  ← Novo botão
+----------------------------------+
```

---

## Alterações Necessárias

### Arquivo: `src/pages/Kanban.tsx`

| Linha | Alteração |
|-------|-----------|
| 21 | Remover import do `CreateDepartmentDialog` |
| 314-344 | Modificar tela vazia para redirecionar para Configurações |

#### Código Atual (linhas 314-344):
```tsx
if (activeDepartments.length === 0) {
  return (
    <div className="h-screen flex flex-col animate-fade-in">
      {/* ... header ... */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FolderPlus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Nenhum departamento criado</h2>
          <p className="text-muted-foreground mb-6">
            Crie departamentos para organizar suas conversas no Kanban.
          </p>
          <CreateDepartmentDialog     ← REMOVER
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Criar Departamento
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
```

#### Código Novo:
```tsx
if (activeDepartments.length === 0) {
  return (
    <div className="h-screen flex flex-col animate-fade-in">
      {/* ... header (mantido) ... */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FolderPlus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Nenhum departamento criado</h2>
          <p className="text-muted-foreground mb-6">
            Crie departamentos em Configurações → Classes → Departamento 
            para organizar suas conversas no Kanban.
          </p>
          <Button onClick={() => navigate("/settings?tab=classes")}>
            <Settings className="h-4 w-4 mr-2" />
            Ir para Configurações
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Kanban.tsx` | Substituir `CreateDepartmentDialog` por botão de navegação |

---

## O que pode ser removido

| Arquivo | Decisão |
|---------|---------|
| `src/components/kanban/CreateDepartmentDialog.tsx` | **Manter** - Pode ser útil para outros fluxos futuros |

---

## Garantias de Segurança

- ✅ **Sem regressão**: Apenas troca visual de botão
- ✅ **Funcionalidade mantida**: Criação de departamentos continua disponível em Configurações
- ✅ **Import removido**: `CreateDepartmentDialog` não será mais importado no Kanban
- ✅ **Navegação clara**: URL com query param `?tab=classes` abre direto na aba correta

---

## Resultado Esperado

Quando um usuário acessar o Kanban sem departamentos:
1. Verá mensagem orientando a criar departamentos em Configurações
2. Ao clicar no botão, será redirecionado para `Configurações > Classes`
3. Poderá criar departamentos na aba "Departamento"
