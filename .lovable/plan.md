

# Correcoes: Contato na Instancia Errada + Notificacao Duplicada

## Problema 1: Contato criado na instancia errada

### Diagnostico
O contato "Contato 2450" foi criado com a instancia `FMOANTIGO63 (***6064)` em vez da `9089` que o usuario selecionou. Investigando o codigo, o `NewContactDialog.tsx` passa corretamente o `connectionId` para o `onCreate`, e o `Contacts.tsx` repassa como `whatsapp_instance_id` para o `createClient.mutateAsync`.

O problema esta no `useEffect` de auto-selecao (linha 44-48 do `NewContactDialog.tsx`): quando o dialog e fechado via `handleClose`, o `selectedConnection` e resetado para `""`. Ao reabrir, o `useEffect` seleciona automaticamente `connectedInstances[0]` - que pode nao ser a instancia que o usuario quer. 

Porem, o usuario troca a selecao manualmente antes de clicar "Iniciar conversa". Se a instancia errada foi salva, o problema pode estar em que `connectedInstances` muda de ordem entre renders (a query `useWhatsAppInstances` retorna instancias em ordem variavel), e o auto-select pode estar sobrescrevendo a selecao manual do usuario quando `connectedInstances` muda de referencia.

**Causa raiz**: O `useEffect` de auto-select tem `connectedInstances` como dependencia. Se a lista re-renderizar (por invalidacao de cache, por exemplo), a referencia do array muda, o `useEffect` executa novamente, e como `selectedConnection` pode estar vazio momentaneamente (entre re-renders), ele sobrescreve a selecao do usuario com `connectedInstances[0]`.

### Solucao
- Mudar o auto-select para rodar apenas quando o dialog **abre** (`open` muda de false para true), nao a cada mudanca de `connectedInstances`
- Usar `open` como dependencia principal do efeito
- Se o usuario ja selecionou uma conexao, nao sobrescrever

### Arquivo: `src/components/contacts/NewContactDialog.tsx`

```text
// Trocar o useEffect atual (linhas 44-48) por:
useEffect(() => {
  if (open && connectedInstances.length > 0 && !selectedConnection) {
    setSelectedConnection(connectedInstances[0].id);
  }
}, [open]); // Rodar apenas quando dialog abre
```

---

## Problema 2: Notificacao sonora dispara quando o atendente envia

### Diagnostico
Existem **duas** fontes de notificacao sonora no sistema:

1. **`useMessageNotifications.tsx`** - O hook inteligente que acabamos de corrigir. Filtra corretamente por `sender_type === 'client'`, handler e assigned_to. **Este esta correto.**

2. **`Conversations.tsx` linha 256** - `onNewMessage: () => playNotification()` passado ao `useMessagesWithPagination`. Este callback dispara para **todas** mensagens novas exceto `is_from_me && sender_type === 'attendant'`. Isso significa que mensagens de IA, bot e ate mensagens enviadas por outros atendentes ainda disparam o som aqui.

### Solucao
Remover o `playNotification()` do `onNewMessage` do `useMessagesWithPagination` em `Conversations.tsx`. A notificacao sonora ja e tratada pelo `useMessageNotifications` de forma inteligente. Manter o `onNewMessage` callback apenas se houver outra logica necessaria (scroll, por exemplo), caso contrario remover o callback.

### Arquivo: `src/pages/Conversations.tsx`

```text
// Linha 254-257: remover o onNewMessage que toca som
const {
  messages,
  setMessages,
  isLoading: messagesLoading,
  isLoadingMore: messagesLoadingMore,
  hasMoreMessages,
  handleScrollToTop: handleMessagesScrollToTop,
} = useMessagesWithPagination({
  conversationId: selectedConversationId,
  initialBatchSize: 35,
  loadMoreBatchSize: 30,
  // Removido: onNewMessage: () => playNotification()
  // A notificacao inteligente ja e gerenciada pelo useMessageNotifications
});
```

---

## Resumo das Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `src/components/contacts/NewContactDialog.tsx` | Corrigir auto-select para rodar apenas na abertura do dialog, evitando sobrescrever a selecao do usuario |
| `src/pages/Conversations.tsx` | Remover `onNewMessage: () => playNotification()` duplicado que ignora as regras de notificacao inteligente |

## Impacto

- **Risco**: Baixo - mudancas pontuais e isoladas
- **Contato**: A instancia selecionada pelo usuario sera respeitada corretamente
- **Notificacao**: O som tocara apenas quando um cliente envia mensagem, seguindo as regras de atribuicao (IA = nenhum, atendente especifico = so ele, fila = todos)
