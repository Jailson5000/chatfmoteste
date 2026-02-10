

# Limpeza: Remover import morto no Conversations.tsx

## Diagnostico

Apos a correcao que removeu o `onNewMessage: () => playNotification()` do `useMessagesWithPagination`, o import e a variavel `playNotification` ficaram orfaos no arquivo `Conversations.tsx`. Nao causam nenhum bug, mas sao codigo desnecessario.

## Mudanca

### Arquivo: `src/pages/Conversations.tsx`

1. **Linha 54**: Remover o import `import { useNotificationSound } from "@/hooks/useNotificationSound";`
2. **Linha 208**: Remover `const { playNotification } = useNotificationSound();`

## Impacto

- **Risco**: Zero - apenas remocao de codigo nao utilizado
- **Resultado**: Arquivo mais limpo, sem dependencia desnecessaria do hook de som

## Estado geral do sistema

Tudo o mais esta funcionando corretamente:
- Planos sincronizados (features text = limites reais)
- Notificacoes inteligentes funcionando (mensagens de clientes + transferencias)
- Auto-select de instancia no dialog de contatos corrigido
- RealtimeSync consolidado operando normalmente
- Nenhum erro no console

