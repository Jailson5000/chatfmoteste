

# Reverter Edge Functions para Evolution API v2.2.3

## Contexto
O Docker foi revertido para `atendai/evolution-api:v2.2.3`. Agora as edge functions precisam voltar aos timings originais da v2.2.3 (Baileys v6 = inicializacao rapida).

## Mudancas

### 1. `supabase/functions/evolution-api/index.ts`

**a) create_instance (linhas 674-678)**
- Comentario: voltar para "v2.2.3 - fast init"
- `maxRetries = 3` volta para `maxRetries = 2`
- `retryDelayMs = 4000` volta para `retryDelayMs = 2000`

**b) get_qrcode - corrupted session recovery (linha 1121-1122)**
- Comentario: voltar para "v2.2.3 optimized"
- `detectedApiVersion = "v2.3.7"` volta para `"v2.2.3"`

**c) Level 1 delays (linha 1247)**
- `setTimeout(resolve, 5000)` volta para `setTimeout(resolve, 3000)`

**d) Level 2 delay pos-logout (linha 1295)**
- `setTimeout(resolve, 5000)` volta para `setTimeout(resolve, 3000)`

**e) Level 2 delay entre retries (linha 1323)**
- `setTimeout(resolve, 5000)` volta para `setTimeout(resolve, 3000)`

### 2. `supabase/functions/auto-reconnect-instances/index.ts`

**Linhas 275-276**: Atualizar comentarios de "v2.3.7" para "v2.2.3". A logica de usar `/instance/connect` diretamente funciona em ambas as versoes, entao nao precisa restaurar o bloco de `/instance/restart`.

### 3. Deploy
Redeployar ambas as edge functions apos as mudancas.

