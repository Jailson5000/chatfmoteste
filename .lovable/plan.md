

# Alerta Sonoro ao Receber Transferencia de Conversa

## Como funciona hoje

O sistema de notificacoes (`useMessageNotifications`) so dispara alertas para **mensagens novas de clientes**. Quando a IA transfere para um atendente, ou um atendente transfere para outro, nenhum som toca - o atendente so percebe se estiver olhando a tela.

## Solucao

Adicionar um listener de **mudancas na tabela `conversations`** usando o `registerConversationCallback` que ja existe no sistema Realtime consolidado. Quando o campo `assigned_to` de uma conversa muda para o ID do usuario logado, tocar o alerta sonoro.

## O que muda

### Arquivo: `src/hooks/useMessageNotifications.tsx`

Adicionar um segundo callback registrado via `registerConversationCallback` (ja disponivel no RealtimeSyncContext) que:

1. Escuta eventos `UPDATE` na tabela `conversations`
2. Verifica se o campo `assigned_to` do registro **novo** e igual ao `user.id` do atendente logado
3. Verifica se o `assigned_to` **anterior** era diferente (para nao tocar em updates irrelevantes)
4. Se sim, toca o som de notificacao e mostra notificacao no navegador ("Conversa transferida para voce")

```text
Logica do novo callback:

if (payload.eventType !== 'UPDATE') return;

const newRecord = payload.new;
const oldRecord = payload.old;

// So notificar se assigned_to mudou PARA o usuario logado
if (newRecord.assigned_to !== user?.id) return;
if (oldRecord.assigned_to === newRecord.assigned_to) return;

// Tocar som + browser notification
```

### Nenhum outro arquivo precisa ser alterado

- O `RealtimeSyncContext` ja tem `registerConversationCallback` implementado e funcionando
- O canal `tenant-core` ja escuta mudancas na tabela `conversations` filtrado por `law_firm_id`
- O hook `useNotificationSound` ja esta importado no arquivo

## Cenarios cobertos

| Cenario | Resultado |
|---------|-----------|
| IA transfere para Atendente A | Atendente A ouve o som |
| Atendente B transfere para Atendente A | Atendente A ouve o som |
| Atendente A transfere para a fila (assigned_to = null) | Ninguem ouve (nao ha destinatario) |
| Conversa volta para IA | Ninguem ouve (assigned_to nao muda para um user) |
| Update de departamento sem mudar assigned_to | Ninguem ouve (assigned_to nao mudou) |

## Impacto

- **Risco**: Muito baixo - apenas adiciona um callback extra no mesmo hook, usando infraestrutura ja existente
- **Canais WebSocket**: Zero novos canais - usa o `registerConversationCallback` que ja existe
- **Arquivo modificado**: Somente `src/hooks/useMessageNotifications.tsx`

