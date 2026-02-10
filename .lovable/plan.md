

# Correcoes: Ponto 10 (Instancia), Kanban Realtime e Som de Notificacoes

## PONTO 10: Contato Salva na Instancia Errada

### Causa Raiz

O problema **nao esta** no `NewContactDialog` nem no `Contacts.tsx` (esses ja passam o `connectionId` corretamente). O bug esta em `Conversations.tsx` linha 725:

```javascript
// Linha 725 - SEMPRE usa a primeira instancia, ignora o parametro da URL
const instance = connectedInstances[0];
```

O fluxo e: Contatos cria o cliente com `whatsapp_instance_id` correto -> navega para `/conversations?phone=X&connectionId=Y` -> Conversations ignora `connectionId` e cria a conversa com `connectedInstances[0]`.

### Solucao

1. Ler o parametro `connectionId` da URL em `Conversations.tsx`
2. Usar a instancia correspondente ao `connectionId` ao criar a conversa
3. Limpar o parametro apos uso

### Arquivo

`src/pages/Conversations.tsx` - Linhas 669-725

| Mudanca | Detalhe |
|---------|---------|
| Linha 670 | Adicionar `const connectionIdParam = searchParams.get("connectionId")` |
| Linha 678 | Adicionar `newParams.delete("connectionId")` |
| Linha 725 | Usar `connectedInstances.find(i => i.id === connectionIdParam) \|\| connectedInstances[0]` |

---

## KANBAN: Nao Atualiza ao Arquivar/Transferir via Menu

### Causa Raiz

Dois problemas combinados:

1. **Debounce de 300ms no Realtime** - O `RealtimeSyncContext` aplica debounce de 300ms para invalidacoes da tabela `conversations`. Isso e normal e funciona.

2. **O verdadeiro problema**: O `updateConversation` em `useConversations.tsx` faz update otimista no `onMutate` (linha 299), e isso funciona. Mas a funcao `onMutate` atualiza os campos genericamente (`{ ...conv, ...updates }`). O Kanban filtra por `archived_at` - quando se arquiva, o campo `archived_at` e setado no update otimista. **Isso deveria funcionar.**

Apos investigacao mais profunda: o problema real e que ao arquivar pelo `KanbanChatPanel`, a funcao `handleArchive` chama `onClose()` logo apos o `mutateAsync`. O `onClose` fecha o painel e pode causar desmontagem de componentes. Porem, o update otimista ja acontece antes (no `onMutate`), entao o card deveria sumir.

**Solucao mais provavel**: Quando o usuario envia mensagem para um cliente arquivado, o `KanbanChatPanel` limpa `archived_at` (linhas 1852-1856), mas faz isso com um `supabase.update()` direto, sem passar pelo `updateConversation.mutate()`. Isso nao dispara o update otimista local, e o Kanban so atualiza quando o Realtime chega (com debounce).

### Solucao

Nos pontos onde o `KanbanChatPanel` faz `supabase.from("conversations").update({ archived_at: null })` diretamente (linhas 1852-1856, 2107-2112, 2255-2258, 2393-2397), adicionar invalidacao explicita do cache apos o update:

```javascript
// Apos o .update() direto:
queryClient.invalidateQueries({ queryKey: ["conversations"] });
```

Ou melhor ainda: usar o `updateConversation.mutate()` que ja tem update otimista.

Para o caso de transferir departamento via menu (handleDepartmentChange no KanbanChatPanel), este ja usa `updateConversationDepartment.mutate()` que tem update otimista. O problema pode ser que o KanbanChatPanel nao fecha/atualiza o painel. Vamos tambem adicionar invalidacao de `conversations` no `onSettled` do `handleDepartmentChange`.

### Arquivos

| Arquivo | Mudanca |
|---------|---------|
| `src/components/kanban/KanbanChatPanel.tsx` | Substituir updates diretos do `archived_at` por `updateConversation.mutate()` ou adicionar `queryClient.invalidateQueries` apos os updates diretos |

---

## PONTO 11: Som de Notificacoes

### Analise

O som atual e um arquivo WAV base64 embutido no codigo. E um som muito curto e basico que pode nao ser audivel em todos os dispositivos. O sistema de notificacoes (`useMessageNotifications`) ja esta funcionando corretamente:

- Recebe mensagens via `RealtimeSyncContext` (canal consolidado)
- Verifica `is_from_me` para nao notificar mensagens proprias
- Respeita preferencias do usuario (`soundEnabled`)

### Problemas Identificados

1. **Som de baixa qualidade**: O WAV base64 e muito curto (~0.5s) e pode ser inaudivel
2. **Novo cliente vs nova mensagem**: O sistema trata tudo igual - nao diferencia um cliente novo de uma mensagem de cliente existente

### Solucao

1. **Substituir o som base64** por um arquivo MP3 real no diretorio `public/` (ex: `public/notification.mp3`). Usar um som de notificacao mais audivel e agradavel.
2. **Manter a logica atual** de `useMessageNotifications` que ja funciona com o Realtime consolidado.
3. **Opcional**: Adicionar um som diferente para "novo cliente" verificando se a mensagem e a primeira de uma conversa nova.

### Risco: Baixo

- Substituir o som e uma mudanca isolada no `useNotificationSound.tsx`
- Nao afeta nenhuma outra funcionalidade
- O sistema de callbacks Realtime ja funciona corretamente

### Arquivos

| Arquivo | Mudanca |
|---------|---------|
| `public/notification.mp3` | Novo arquivo de som |
| `src/hooks/useNotificationSound.tsx` | Trocar base64 por referencia ao arquivo MP3 |

---

## Resumo de Implementacao

| Prioridade | Item | Risco | Complexidade |
|-----------|------|-------|-------------|
| 1 | Ponto 10 - Instancia correta | Baixo | Baixa |
| 2 | Kanban realtime | Baixo | Media |
| 3 | Som notificacoes | Baixo | Baixa |

### Arquivos a Modificar

| Arquivo | Pontos |
|---------|--------|
| `src/pages/Conversations.tsx` | 10 |
| `src/components/kanban/KanbanChatPanel.tsx` | Kanban realtime |
| `src/hooks/useNotificationSound.tsx` | 11 |
| `public/notification.mp3` | 11 (novo arquivo) |

