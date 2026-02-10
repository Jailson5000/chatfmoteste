

# Notificacao Inteligente: Alerta Apenas para o Atendente Responsavel

## Regras de Negocio

| Situacao da Conversa | Quem recebe o alerta? |
|---|---|
| Sem atendente (unassigned) | Todos os atendentes |
| Atendente humano atribuido | Somente o atendente atribuido |
| Com IA (current_handler = "ai") | Ninguem |
| Transferida para alguem | O novo responsavel (assigned_to) |

## Solucao

Modificar o hook `useMessageNotifications.tsx` para:

1. Obter o **user ID** do usuario logado (via `useAuth`)
2. Ao receber uma mensagem de cliente, buscar a **conversa correspondente** no cache do React Query (queryKey `["conversations"]`) usando o `conversation_id` da mensagem
3. Aplicar as regras de decisao antes de tocar o som

## Detalhes Tecnicos

### Arquivo: `src/hooks/useMessageNotifications.tsx`

**Novas dependencias:**
- `useAuth` para obter `user.id` do atendente logado
- `useQueryClient` do React Query para acessar o cache de conversas

**Logica no `handleNewMessage`:**

```text
// 1. Filtros existentes (mantem)
if (message.is_from_me) return;
if (message.sender_type !== 'client') return;

// 2. Buscar conversa no cache do React Query
const allConversations = queryClient.getQueryData(["conversations", lawFirm?.id]);
const conversation = allConversations?.find(c => c.id === message.conversation_id);

// 3. Se conversa esta com IA -> nao notificar ninguem
if (conversation?.current_handler === 'ai') return;

// 4. Se conversa tem atendente humano -> notificar apenas esse atendente
if (conversation?.assigned_to) {
  if (conversation.assigned_to !== user?.id) return;
  // Se chegou aqui, o usuario logado E o atendente atribuido -> notifica
}

// 5. Se nao tem atendente (unassigned) -> notifica todos (nao faz return)
// Continua para tocar o som e mostrar notificacao...
```

### Fluxo de decisao

```text
Mensagem recebida (sender_type = 'client')
  |
  v
Conversa com IA? ----SIM----> Nao notifica
  |
  NAO
  |
  v
Conversa tem atendente humano? ----SIM----> Atendente logado = assigned_to?
  |                                            |           |
  NAO                                         SIM         NAO
  |                                            |           |
  v                                       Notifica    Nao notifica
Notifica TODOS
```

## Impacto

- **Risco**: Baixo - apenas adiciona filtros extras no hook existente
- **Arquivo modificado**: Somente `src/hooks/useMessageNotifications.tsx`
- **Resultado**: Cada atendente so ouve alertas das suas proprias conversas; conversas sem dono notificam todos; conversas com IA nao notificam ninguem

