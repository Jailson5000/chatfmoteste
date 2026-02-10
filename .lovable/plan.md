

# Corrigir Som Disparando a Cada Mensagem Enviada pelo Atendente

## Problema

Toda vez que o atendente envia uma mensagem (texto, audio, midia), o codigo chama `transferHandler.mutateAsync()` para auto-atribuir a conversa ao atendente. Isso atualiza `assigned_to` de `null` para o ID do atendente, e o callback `handleConversationTransfer` (linha 75 do `useMessageNotifications.tsx`) detecta essa mudanca e **toca o som indevidamente**.

O filtro de mensagens (`handleNewMessage`) funciona corretamente -- ele ja ignora mensagens com `is_from_me = true`. O problema esta exclusivamente no callback de **transferencia**.

## Solucao

Adicionar **uma unica linha** no `handleConversationTransfer` para ignorar auto-atribuicoes:

Se o `assigned_to` anterior era `null` (conversa na fila) **e** o `current_handler` anterior nao era `ai`, significa que o proprio atendente se auto-atribuiu ao enviar mensagem. Nesse caso, nao tocar som.

## Mudanca

### Arquivo: `src/hooks/useMessageNotifications.tsx`

Adicionar apos a linha 84, dentro da funcao `handleConversationTransfer`:

```text
// Suprimir som quando o atendente se auto-atribui ao enviar mensagem
// (assigned_to era null e IA nao estava no controle)
if (!oldRecord.assigned_to && oldRecord.current_handler !== 'ai') return;
```

## Cenarios cobertos

| Cenario | Toca som? |
|---------|-----------|
| Atendente envia mensagem e se auto-atribui da fila | Nao |
| IA transfere conversa para Atendente A | Sim |
| Atendente B transfere para Atendente A | Sim |
| Conversa vai para a fila (assigned_to = null) | Nao |
| Update de departamento sem mudar assigned_to | Nao |

## Impacto

- **Risco**: Muito baixo - uma unica condicao adicionada
- **Arquivo modificado**: Somente `src/hooks/useMessageNotifications.tsx`
- **Zero mudancas em infraestrutura ou WebSocket**
