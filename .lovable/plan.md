
# Correção: Rastreamento de Arquivamento de Conversas

## Problemas Identificados

### 1. Falta de Rastreamento de Quem Arquivou
A tabela `conversations` **não possui** a coluna `archived_by`. Quando uma conversa é arquivada:
- ✅ `archived_at` - Timestamp registrado
- ✅ `archived_reason` - Motivo registrado
- ❌ `archived_by` - **NÃO EXISTE** - Quem arquivou não é registrado

### 2. Interface Não Mostra Informações de Arquivamento
Mesmo com as informações existentes (`archived_reason`, `archived_at`), a interface de chat não exibe essas informações de forma clara quando a conversa está arquivada.

---

## Solução Proposta

### Etapa 1: Adicionar Coluna `archived_by` no Banco de Dados

```sql
-- Adicionar coluna para rastrear quem arquivou
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- Comentário explicativo
COMMENT ON COLUMN conversations.archived_by IS 'ID do usuário que arquivou a conversa';
```

### Etapa 2: Atualizar Lógica de Arquivamento

**Arquivo:** `src/pages/Conversations.tsx`

Na função `handleArchiveConversation` (linha ~2594), adicionar o ID do usuário atual:

```typescript
// Build the update payload
const updatePayload: any = {
  id: selectedConversation.id,
  archived_at: new Date().toISOString(),
  archived_reason: reasonText,
  archived_by: user?.id, // ← NOVO: Registrar quem arquivou
  // ... resto do payload
};
```

### Etapa 3: Buscar Nome do Arquivador

**Arquivo:** `src/hooks/useConversations.tsx`

Na função RPC `get_conversations_with_metadata`, incluir join para buscar o nome de quem arquivou:

```sql
-- Adicionar no retorno da RPC:
LEFT JOIN profiles archived_by_profile ON c.archived_by = archived_by_profile.id
```

E retornar no mapeamento:
```typescript
archived_by_name: row.archived_by_profile?.full_name || null,
```

### Etapa 4: Exibir Informação na Interface

**Quando a conversa está arquivada, mostrar um banner ou indicador:**

```text
┌─────────────────────────────────────────────────────────┐
│ 📦 Conversa arquivada                                   │
│ Por: João Silva • Em: 30/01/2026 às 13:01              │
│ Motivo: Chat do cliente resolvido com sucesso.         │
│                                                        │
│ [Desarquivar]                                           │
└─────────────────────────────────────────────────────────┘
```

**Arquivo:** `src/pages/Conversations.tsx` (área do chat header)

Adicionar um componente de alerta quando `selectedConversation.archived_at` existir:

```tsx
{selectedConversation?.archived_at && (
  <div className="bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 p-3 m-2 rounded">
    <div className="flex items-center gap-2">
      <Archive className="h-4 w-4 text-orange-600" />
      <span className="font-medium text-orange-800 dark:text-orange-200">
        Conversa arquivada
      </span>
    </div>
    <div className="text-sm text-orange-700 dark:text-orange-300 mt-1">
      {archivedByName && `Por: ${archivedByName} • `}
      Em: {formatDate(selectedConversation.archived_at)}
    </div>
    {selectedConversation.archived_reason && (
      <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">
        Motivo: {selectedConversation.archived_reason}
      </div>
    )}
  </div>
)}
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| **Banco de Dados** | Adicionar coluna `archived_by` (UUID) |
| `src/pages/Conversations.tsx` | Enviar `user.id` ao arquivar + exibir banner de info |
| `src/components/kanban/KanbanChatPanel.tsx` | Mesma lógica de arquivamento |
| `src/hooks/useConversations.tsx` | Mapear novo campo `archived_by_name` |
| RPC `get_conversations_with_metadata` | Join com profiles para nome |

---

## Fluxo Após Correção

```text
Usuário clica "Arquivar"
        ↓
Dialog de arquivamento (escolhe motivo)
        ↓
Sistema salva:
  • archived_at = now()
  • archived_reason = "Chat resolvido..."
  • archived_by = user.id  ← NOVO
        ↓
Conversa vai para aba "Arquivados"
        ↓
Ao abrir conversa arquivada:
  ✓ Mostra banner amarelo com informações
  ✓ "Arquivado por: João Silva"
  ✓ "Em: 30/01/2026 às 13:01"
  ✓ "Motivo: Chat do cliente resolvido"
```

---

## Benefícios

1. **Rastreabilidade**: Saber exatamente quem arquivou cada conversa
2. **Auditoria**: Permite revisar ações dos atendentes
3. **Clareza Visual**: Usuário entende imediatamente o estado da conversa
4. **Contexto**: Motivo do arquivamento visível no chat
