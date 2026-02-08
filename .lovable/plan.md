
# Correção: Contador da Aba Mostra Mensagens ao Invés de Conversas

## Problema Identificado

O número "(78)" mostrado na aba do navegador está contando o **total de mensagens não lidas** em todas as conversas, quando deveria contar **quantas conversas têm mensagens não lidas** (quantidade de clientes que entraram em contato).

### Exemplo do Bug

| Situação | Comportamento Atual (Bug) | Comportamento Correto |
|----------|---------------------------|----------------------|
| 10 clientes, 78 mensagens não lidas no total | Mostra "(78)" | Deveria mostrar "(10)" |
| 2 clientes, 5 mensagens cada | Mostra "(10)" | Deveria mostrar "(2)" |

## Causa Raiz

**Arquivo:** `src/pages/Conversations.tsx` (linhas 578-580)

```typescript
// Código atual (soma mensagens)
const totalUnread = useMemo(() => 
  conversations.reduce((sum, conv) => sum + ((conv as any).unread_count || 0), 0),
  [conversations]
);
```

O `reduce` está **somando** todos os `unread_count`, quando deveria **contar** quantas conversas têm `unread_count > 0`.

## Solução Proposta

Alterar a lógica para contar conversas com mensagens não lidas ao invés de somar as mensagens:

```typescript
// Código corrigido (conta conversas com não lidas)
const totalUnread = useMemo(() => 
  conversations.filter(conv => ((conv as any).unread_count || 0) > 0).length,
  [conversations]
);
```

## Arquivo a Alterar

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `src/pages/Conversations.tsx` | 578-580 | Trocar `.reduce()` por `.filter().length` |

## Impacto

- O título da aba passará a mostrar o número correto de clientes/conversas pendentes
- Nenhuma quebra em outras funcionalidades (a mudança é isolada ao cálculo do título)
- Retrocompatibilidade total - apenas muda a lógica de contagem

## Validação Recomendada

Após a correção:
1. Abrir a página de Conversas
2. Verificar que o número na aba do navegador corresponde à quantidade de conversas (cards) com badge de não lidas visível
3. Confirmar que ao marcar uma conversa como lida, o número na aba diminui em 1 (não pelo total de mensagens daquela conversa)
