
## ✅ CONCLUÍDO: Sessoes "Fantasma" - Logout Forcado Implementado

### O que foi feito

Adicionado `/instance/logout` no `evolution-api/index.ts` quando "Connection Closed" é detectado no envio de mensagens (texto e mídia).

### Fluxo corrigido

```text
Connection Closed → /instance/logout (mata sessão no Evolution) → marca DB disconnected
→ auto-reconnect vê "close" → /instance/connect → sessão limpa → mensagens voltam
```

### Arquivos editados

1. `supabase/functions/evolution-api/index.ts` - Logout forçado em ambos os blocos de Connection Closed (texto linha ~2077 e mídia linha ~1970)
