

# Correcao: Alerta Sonoro Apenas para Mensagens de Clientes

## Problema

O alerta sonoro toca para **todas** as mensagens recebidas (`is_from_me === false`), incluindo respostas da IA. O correto e tocar apenas quando um **cliente** envia mensagem.

## Causa Raiz

Na linha 33 do `useMessageNotifications.tsx`, o filtro atual e:

```text
if (message.is_from_me) return;
```

Isso permite que mensagens da IA (sender_type = "ai" ou "bot") e de outros atendentes tambem disparem o alerta, ja que essas mensagens tambem tem `is_from_me = false`.

## Solucao

Adicionar uma verificacao extra no `sender_type` para garantir que so mensagens de clientes disparam o alerta:

```text
// Apenas alertar para mensagens de clientes (nao de IA ou atendentes)
if (message.is_from_me) return;
if (message.sender_type !== 'client') return;
```

Assim, mensagens com `sender_type` igual a `"ai"`, `"bot"`, `"agent"`, `"system"` ou qualquer outro valor serao ignoradas pelo sistema de notificacao.

## Arquivo a Modificar

| Arquivo | Linha | Mudanca |
|---------|-------|---------|
| `src/hooks/useMessageNotifications.tsx` | 33 | Adicionar `if (message.sender_type !== 'client') return;` apos o check de `is_from_me` |

## Impacto

- **Risco**: Nenhum - apenas adiciona um filtro extra ao que ja existe
- **Resultado**: Som e notificacao do navegador so disparam quando o cliente envia mensagem

