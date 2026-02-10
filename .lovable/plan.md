

# Correcoes: Kanban Realtime, Via Anuncio, e Som

## 4 Problemas Identificados

### 1. Kanban nao atualiza ao mudar departamento pelo menu

**Causa raiz**: O `handleDepartmentChange` no `KanbanChatPanel` usa `updateConversationDepartment.mutate()` que ja tem update otimista e `onSettled` com `invalidateQueries`. O update otimista atualiza `department_id` na lista local de conversas. **Mas** o `Kanban.tsx` usa a lista `conversations` do hook, e o painel continua aberto mostrando o card na coluna antiga. O problema e que apos o department change, o `onClose` **nao e chamado** - o painel permanece aberto e o card continua visivel na coluna antiga porque o painel nao fecha automaticamente.

**Solucao**: No `handleDepartmentChange`, apos o `onSuccess`, chamar `onClose()` para fechar o painel (assim o card aparece na nova coluna corretamente). Alternativamente, adicionar `queryClient.invalidateQueries({ queryKey: ["conversations"] })` explicitamente no `onSuccess`.

### 2. Kanban nao atualiza ao arquivar pelo menu

**Causa raiz**: O `handleArchive` ja usa `updateConversation.mutateAsync()` com update otimista (linha 2510). O `onClose()` e chamado logo apos (linha 2514). O update otimista altera `archived_at` localmente. O problema pode ser que `onClose` fecha o painel antes do `invalidateQueries` do `onSuccess` rodar, e o `cancelQueries` no `onMutate` pode cancelar o refetch subsequente.

**Solucao**: Apos `updateConversation.mutateAsync()` e antes de `onClose()`, forcar `queryClient.invalidateQueries({ queryKey: ["conversations"] })` explicitamente.

### 3. "Via Anuncio" - X nao aparece

**Causa raiz**: O botao X so existe dentro do `AdClickBanner`, que so renderiza quando a conversa tem `ad_title`, `ad_body` ou `ad_thumbnail` no `origin_metadata`. Muitas conversas vindas de anuncio tem `origin === 'whatsapp_ctwa'` mas o `origin_metadata` pode nao ter esses campos especificos, entao o banner nao aparece e o X tambem nao.

Alem disso, o usuario quer remover o badge "Via Anuncio" que aparece nos cards do Kanban e na sidebar de conversas - esses badges **nunca** tiveram botao de dismiss.

**Solucao**: 
- Adicionar um botao X diretamente ao badge "Via Anuncio" no `KanbanCard.tsx` e no `ConversationSidebarCard.tsx`
- Quando clicar no X, limpar `origin` e `origin_metadata` da conversa e invalidar o cache
- Manter o `AdClickBanner` com o dismiss tambem, mas o ponto principal e o badge nos cards

### 4. Som de notificacao - mudar o tipo

O usuario confirma que o som funciona, mas quer mudar o tipo de som. Como o `notification.mp3` criado anteriormente foi gerado como placeholder vazio (base64 nao cria arquivo real de audio), precisamos gerar um som real ou referenciar um som web.

**Solucao**: Usar Web Audio API para gerar um som de notificacao programaticamente (sem dependencia de arquivo externo), com um tom mais agradavel e distinto.

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/kanban/KanbanChatPanel.tsx` | Adicionar `queryClient.invalidateQueries` + `onClose()` apos department change e archive |
| `src/components/kanban/KanbanCard.tsx` | Adicionar botao X ao badge "Via Anuncio" com dismiss |
| `src/components/conversations/ConversationSidebarCard.tsx` | Adicionar botao X ao badge "Via Anuncio" com dismiss |
| `src/hooks/useNotificationSound.tsx` | Gerar som via Web Audio API (tom melodico) em vez de depender de arquivo MP3 |

## Detalhes Tecnicos

### KanbanChatPanel - Department Change (linhas 2677-2685)

Adicionar `onClose()` no `onSuccess` para fechar o painel apos mover:

```javascript
const handleDepartmentChange = (deptId: string) => {
  const newDeptId = currentDepartment?.id === deptId ? null : deptId;
  updateConversationDepartment.mutate({ conversationId, departmentId: newDeptId, clientId }, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Departamento atualizado" });
      setDepartmentOpen(false);
      onClose(); // Fechar painel para refletir mudanca no board
    },
  });
};
```

### KanbanChatPanel - Archive (linhas 2510-2514)

Adicionar invalidacao explicita antes de fechar:

```javascript
await updateConversation.mutateAsync(updatePayload);
queryClient.invalidateQueries({ queryKey: ["conversations"] });
toast({ title: "Conversa arquivada" });
setArchiveDialogOpen(false);
onClose();
```

### KanbanCard - Badge com X

Adicionar um pequeno X no badge "Via Anuncio" que ao clicar:
1. Faz `stopPropagation()` (para nao abrir o card)
2. Chama `supabase.from("conversations").update({ origin: null, origin_metadata: null }).eq("id", conversation.id)`
3. Invalida o cache

### NotificationSound - Web Audio API

Gerar um som de "ding" de 2 tons usando `AudioContext.createOscillator()` para garantir que funcione em todos os navegadores sem depender de arquivo externo.

