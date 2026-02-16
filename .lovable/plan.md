
# Correcao: Race Condition no Deep-Link do Kanban

## Causa Raiz Identificada

O problema e uma **race condition de timing**. Quando o usuario navega do Kanban para `/conversations?id=xxx`:

```text
Tempo 0ms:  Componente monta, useLawFirm() inicia query async
            lawFirm = null
            
Tempo 0ms:  useConversations() -> isLoading = false
            (query desabilitada porque lawFirm?.id = null,
             TanStack Query v5 retorna isLoading=false para queries desabilitadas)

Tempo 0ms:  Deep-link useEffect roda porque isLoading = false
            -> conversations vazio, chama fetchSingleConversation(id)
            -> lawFirm?.id = null -> return null IMEDIATAMENTE
            -> Toast "Conversa nao encontrada"

Tempo 200ms: lawFirm carrega (tarde demais, deep-link ja falhou)
```

O `fetchSingleConversation` tem `if (!lawFirm?.id) return null` na primeira linha. Como `lawFirm` ainda nao carregou quando o effect roda, a funcao retorna null sem nem tentar buscar no banco.

## Correcao

### Arquivo: `src/pages/Conversations.tsx` (deep-link effect, ~linha 670)

Adicionar uma verificacao que impede o effect de rodar enquanto `lawFirm` nao estiver disponivel. A abordagem:

1. Importar `useLawFirm` no componente Conversations (ou acessar via o hook existente)
2. No effect do deep-link, adicionar guard: se `idParam` existe mas `lawFirm` ainda nao carregou, **nao executar** (retornar sem fazer nada). O effect sera re-executado quando `lawFirm` ficar disponivel.

### Arquivo: `src/hooks/useConversations.tsx`

Expor `lawFirm` e o estado `isLawFirmLoading` no retorno do hook para que o componente saiba quando o tenant esta pronto.

### Logica corrigida:

```text
Deep-link effect:
  if (isLoading) return;                    // query de conversas carregando
  if (idParam && !lawFirmReady) return;     // NOVO: tenant nao carregou ainda
  
  ... resto do codigo igual ...
```

Isso garante que `fetchSingleConversation` so sera chamado quando `lawFirm.id` ja existir, permitindo a busca real no banco.

## Risco

**Zero**. A unica mudanca e adiar a execucao do effect de deep-link por ~200ms ate o tenant carregar. O fluxo normal de conversas nao e afetado.
