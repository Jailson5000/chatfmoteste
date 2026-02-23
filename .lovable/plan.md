

## Corrigir Bug de Parsing que Causa Todas as Desconexoes

### Causa Raiz Comprovada (com logs)

O endpoint `/instance/connect` da Evolution API v2.3.7 retorna o campo **`status`**, mas nosso codigo procura pelo campo **`state`**. Resultado: `state` e SEMPRE `undefined`.

**Prova nos logs:**
```
15:15:14 /instance/connect returned state=undefined for inst_l26f156k
15:15:09 /instance/connect returned state=undefined for inst_0gkejsc5
15:12:40 Reconnect response: state=undefined, status=200
15:11:04 Reconnect response: state=undefined, status=200
```

A Evolution API v2.3.7 retorna:
```json
{ "instance": { "instanceName": "inst_xxx", "status": "open" } }
```

Nosso codigo faz:
```javascript
const state = data?.instance?.state || data?.state;  // SEMPRE undefined!
```

### Cascata de Problemas Causada por Este Bug

```text
1. Auto-reconnect chama fetchInstances -> "open" (correto)
2. Auto-reconnect chama /instance/connect para VERIFICAR
3. Resposta tem status="open" mas codigo procura state -> undefined
4. socketVerified = false (ERRADO - deveria ser true)
5. Cai no fallback -> chama /instance/connect NOVAMENTE (attemptConnect)
6. attemptConnect TAMBEM nao entende a resposta (mesmo bug)
7. Resultado: 2x chamadas /instance/connect por instancia a cada 5 min
8. 3 instancias x 2 chamadas = 6 reconexoes desnecessarias a cada 5 min
9. Cada /instance/connect reinicia o socket Baileys
10. Sockets NUNCA estabilizam -> messages.upsert NUNCA chegam
11. Envio falha com "Connection Closed" -> mais 1 /instance/connect
12. Ciclo infinito de reinicio de sockets
```

**Confirmacao:** ZERO eventos `messages.upsert` nos logs do webhook. Apenas eventos `connection.update`. As conexoes estao sendo reiniciadas tao frequentemente que Baileys nao consegue processar mensagens.

### Solucao: Corrigir Parsing em 3 Pontos

**O bug existe em 3 lugares identicos. A correcao e a mesma em todos:**

Trocar:
```text
data?.instance?.state || data?.state
```
Por:
```text
data?.instance?.state || data?.instance?.status || data?.instance?.connectionStatus || data?.state || data?.status
```

**Arquivo 1: `supabase/functions/auto-reconnect-instances/index.ts`**

Corrigir em 2 pontos:
- Linha 119 (funcao `attemptConnect`): `const state = data?.instance?.state || data?.state;`
- Linha 387 (verificacao de socket): `const verifyState = verifyData?.instance?.state || verifyData?.state;`

Adicionar log da resposta COMPLETA para diagnostico futuro:
```text
console.log(`[Auto-Reconnect] /instance/connect raw response:`, JSON.stringify(data).slice(0, 500));
```

**Arquivo 2: `supabase/functions/evolution-api/index.ts`**

Corrigir em 1 ponto:
- Linha 2123 (retry apos Connection Closed): `const connectState = connectData?.instance?.state || connectData?.state;`

Tambem corrigir o mesmo parsing na logica de envio de MEDIA (linhas ~1975-1985).

### Impacto Esperado

| Antes (bug) | Depois (fix) |
|---|---|
| `/instance/connect` retorna `state=undefined` | Lido corretamente como `status: "open"` |
| socketVerified = false SEMPRE | socketVerified = true quando realmente conectado |
| 6+ chamadas /instance/connect a cada 5 min | 0 chamadas desnecessarias (instancias reconhecidas) |
| Sockets reiniciados constantemente | Sockets estabilizam |
| ZERO messages.upsert | Mensagens voltam a fluir |
| Toda mensagem enviada falha com "Connection Closed" | Mensagens enviadas com sucesso |
| Auto-reconnect marca connected, webhook desfaz, cron tenta de novo | Instancias permanecem como connected |

### Logica Corrigida do Auto-Reconnect

```text
1. fetchInstances retorna "open" -> isConnected=true
2. /instance/connect para verificar -> status="open" -> socketVerified=true (CORRIGIDO)
3. Atualiza DB para "connected" e PARA (nao chama attemptConnect)
4. Na proxima execucao, instancia ja e "connected" -> nao entra no filtro
5. Sockets estabilizam -> messages.upsert comecam a chegar
6. Mensagens enviadas com sucesso
```

### Arquivos Editados

1. `supabase/functions/auto-reconnect-instances/index.ts` - Corrigir parsing em attemptConnect (L119) e verificacao de socket (L387)
2. `supabase/functions/evolution-api/index.ts` - Corrigir parsing no retry de text (L2123) e media (~L1975)

### Observacao Tecnica

Este e um bug classico de incompatibilidade de campo. A Evolution API usa `status` no response de `/instance/connect`, mas `connectionStatus` no response de `fetchInstances`, e `state` nos eventos de webhook. Nosso codigo assumiu que todos usavam `state`.
