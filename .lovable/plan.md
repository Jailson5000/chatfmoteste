

# Limitar Reconexao Automatica a 2 Tentativas

## Problema
O sistema atual tenta reconectar ate **3 vezes** em uma janela de **3 minutos** (`MAX_RECONNECT_ATTEMPTS = 3`). Cada tentativa envia requisicoes ao WhatsApp, e com multiplas instancias isso gera dezenas de conexoes simultaneas, resultando em bloqueio temporario pelo WhatsApp ("tente mais tarde").

## Mudancas

### Arquivo: `supabase/functions/auto-reconnect-instances/index.ts`

1. **Linha 12**: Reduzir `MAX_RECONNECT_ATTEMPTS` de `3` para `2`
2. **Linha 13**: Aumentar `ATTEMPT_WINDOW_MINUTES` de `3` para `5` - dar mais espaco entre ciclos para o WhatsApp nao bloquear
3. **Linha 698**: Aumentar delay entre instancias de `1000ms` para `3000ms` - evitar rajadas de conexoes simultaneas

### Comportamento Apos a Mudanca

- A funcao `auto-reconnect-instances` tenta reconectar no maximo **2 vezes** em **5 minutos**
- Apos 2 tentativas falhas, a instancia e marcada como `awaiting_qr` e o sistema **para de tentar**
- O usuario precisa ir manualmente em Conexoes e clicar "Gerar QR Code"
- Quando o usuario conecta com sucesso, o contador (`reconnect_attempts_count`) e zerado automaticamente, permitindo futuras reconexoes
- Delay de 3 segundos entre instancias evita rajada de requisicoes

### Deploy
Redeployar a edge function `auto-reconnect-instances`.

