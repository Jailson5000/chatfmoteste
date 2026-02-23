

# Corrigir Edge Functions para Evolution API v2.3.7

## Problema

As edge functions foram otimizadas para a v2.2.3 (Baileys v6, inicializacao rapida). A v2.3.7 usa Baileys v7 que precisa de mais tempo para inicializar sessoes. Alem disso, o endpoint `/instance/restart` nao existe na v2.3.x (retorna 404).

## Mudancas Necessarias

### 1. `auto-reconnect-instances/index.ts`

**Problema**: Tenta `/instance/restart` primeiro (linhas 275-337), que retorna 404 na v2.3.x.

**Correcao**: Remover a tentativa de restart e ir direto para `/instance/connect`. Atualizar comentarios de "v2.2.3" para "v2.3.7".

### 2. `evolution-api/index.ts`

Duas areas precisam de ajuste:

**a) create_instance (linhas 674-678)**
- Comentario diz "v2.2.3 - fast init"
- `maxRetries = 2` e `retryDelayMs = 2000` sao curtos demais para Baileys v7
- Corrigir para `maxRetries = 3` e `retryDelayMs = 4000`

**b) get_qrcode - corrupted session recovery (linhas 1121-1122, 1217-1249)**
- Variavel `detectedApiVersion` hardcoded como "v2.2.3"
- Level 1: delays de 3s sao curtos para Baileys v7
- Corrigir para `detectedApiVersion = "v2.3.7"`, delays de 5s no Level 1, e 5s no Level 2

## Detalhes Tecnicos

### auto-reconnect-instances/index.ts
- Linhas 271-337: Remover bloco try/catch do `/instance/restart` e ir direto para `/instance/connect` como fallback unico
- Atualizar log de "v2.2.3 preferred" para "v2.3.7 - connect only"

### evolution-api/index.ts
- Linha 676: Atualizar comentario para "v2.3.7 - Baileys v7 needs more time"
- Linha 677: `maxRetries = 2` para `maxRetries = 3`
- Linha 678: `retryDelayMs = 2000` para `retryDelayMs = 4000`
- Linha 1121: Atualizar comentario para "v2.3.7 - Baileys v7"
- Linha 1122: `"v2.2.3"` para `"v2.3.7"`
- Linha 1218: Atualizar log de Level 1 com delays corretos
- Linha 1247: Delay entre retries de 3000 para 5000ms
- Linha 1295: Delay pos-logout de 3000 para 5000ms
- Linha 1323: Delay entre retries Level 2 de 3000 para 5000ms

### Sem mudancas necessarias
- `evolution-webhook/index.ts` - ja compativel (logica de status preservation funciona igual)
- `sync-evolution-instances/index.ts` - ja compativel (usa fetchInstances que funciona igual)

