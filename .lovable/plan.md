

# Correção: Status, Etiquetas e Departamentos não aparecem todos em Conversas

## Problema Identificado

Na página **Conversas**, o painel lateral (`ContactDetailsPanel`) mostra apenas **5 status**, enquanto no **Kanban** (`KanbanChatPanel`) todos os **10 status** aparecem corretamente.

### Causa Raiz

O `ContactDetailsPanel` **não está filtrando** os status e departamentos pelo campo `is_active`, mas o `KanbanChatPanel` está. Isso causa uma inconsistência visual:

| Componente | Código atual | Status exibidos |
|------------|--------------|-----------------|
| `KanbanChatPanel.tsx` (linha 2693) | `customStatuses.filter(s => s.is_active).map(...)` | ✅ Todos ativos |
| `KanbanChatPanel.tsx` (linha 2800) | `departments.filter(d => d.is_active).map(...)` | ✅ Todos ativos |
| `ContactDetailsPanel.tsx` (linha 881) | `statuses.map(...)` | ❌ Sem filtro |
| `ContactDetailsPanel.tsx` (linha 1037) | `departments.map(...)` | ❌ Sem filtro |

**Observação:** A tabela `tags` não possui campo `is_active`, portanto não precisa de filtro.

## Solução

Adicionar filtro `is_active` no `ContactDetailsPanel.tsx` para manter consistência com o Kanban.

### Alterações

**Arquivo:** `src/components/conversations/ContactDetailsPanel.tsx`

**1. Status (linha 881)**
```
De:
{statuses.map(status => {

Para:
{statuses.filter(s => s.is_active !== false).map(status => {
```

**2. Departamentos (linha 1037)**
```
De:
{departments.map(dept => {

Para:
{departments.filter(d => d.is_active !== false).map(dept => {
```

### Por que `!== false` em vez de `=== true`?

O `ContactDetailsPanel` recebe os props como `Array<{ id: string; name: string; color: string }>` sem o campo `is_active`. Para garantir compatibilidade:
- Se `is_active` existir e for `false` → oculta
- Se `is_active` não existir ou for `true` → exibe

Alternativamente, podemos atualizar a interface do componente para incluir `is_active` nas props ou ajustar a passagem de dados na página Conversations.tsx.

## Fluxo Após a Correção

```text
┌─────────────────────────────────────────────────────────────────┐
│           Usuário abre painel de detalhes em Conversas          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Hook useCustomStatuses() retorna todos os 10 status         │
│  2. Conversations.tsx passa para ContactDetailsPanel            │
│  3. ContactDetailsPanel filtra por is_active !== false          │
│  4. Apenas status ativos são renderizados                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│        TODOS os status ativos aparecem (igual ao Kanban)        │
└─────────────────────────────────────────────────────────────────┘
```

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/conversations/ContactDetailsPanel.tsx` | Adicionar filtro `is_active` em status e departments |
| `src/pages/Conversations.tsx` | Passar campo `is_active` nas props de statuses e departments |

## Verificação de Não-Regressão

A alteração é conservadora:
- Só filtra itens explicitamente marcados como inativos (`is_active === false`)
- Mantém comportamento existente para itens sem o campo
- Não afeta lógica de seleção, salvamento ou outras funcionalidades
- Alinha o comportamento com o Kanban já em produção

## Risco

**Baixo** - Apenas adiciona filtro para ocultar itens inativos, seguindo o mesmo padrão já utilizado no Kanban.

