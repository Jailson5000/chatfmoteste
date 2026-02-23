
## Corrigir: Auto-Reconnect Nao Detecta Sessoes Fantasma

### Causa Raiz Comprovada (testes diretos na API)

Testes reais feitos AGORA na Evolution API confirmam:

| Instancia | fetchInstances | connectionState (REAL) | Webhook events | DB status |
|---|---|---|---|---|
| inst_7sw6k99c (MIAU) | open | **close** | connecting (loop) | connected |
| inst_0gkejsc5 (3528) | open | close/connecting | connecting (loop) | connected |
| inst_l26f156k (9089) | open | close/connecting | connecting (loop) | connected |
| inst_ea9bfhx3 (LOJA LIZ) | open | close/connecting | connecting (loop) | connected |

**`fetchInstances` mente** - retorna `connectionStatus: open` baseado no REGISTRO da instancia, nao no estado real do socket Baileys. O estado real vem do endpoint `/instance/connectionState/{name}` que retorna `close`.

### Por que nada funciona atualmente

```text
1. Auto-reconnect busca instancias com status IN ("connecting", "disconnected")
2. TODAS estao marcadas como "connected" no DB (porque fetchInstances disse "open")
3. ZERO instancias qualificam para reconexao
4. Sockets Baileys estao mortos (connectionState = close)
5. Webhook recebe apenas "connecting" em loop infinito
6. ZERO messages.upsert chegam
7. Todo envio falha com "Connection Closed"
8. Logout no envio marca como "disconnected" temporariamente
9. Auto-reconnect roda, fetchInstances diz "open", marca "connected" de novo
10. Volta ao passo 1 - ciclo infinito
```

### Solucao: Verificacao em Duas Etapas

Mudar `checkConnectionState` no `auto-reconnect-instances/index.ts` para verificar AMBOS os endpoints:

```text
ANTES:
  fetchInstances = "open" -> confiar -> marcar connected -> FIM

DEPOIS:
  fetchInstances = "open" -> verificar com /instance/connectionState
    -> connectionState = "open" -> marcar connected (sessao REALMENTE funcional)
    -> connectionState = "close"/"connecting" -> forcar logout + reconnect
```

A diferenca crucial: `/instance/connectionState` e READ-ONLY (nao reinicia o socket como `/instance/connect`).

### Mudancas Tecnicas

**Arquivo 1: `supabase/functions/auto-reconnect-instances/index.ts`**

1. Modificar `checkConnectionState()` para retornar um campo adicional `socketState`
2. Apos fetchInstances retornar "open", chamar `/instance/connectionState/{name}` para confirmar
3. Se connectionState != "open", retornar `{ isConnected: false, ghostSession: true }`

4. No loop principal (linha 374), quando `connectionCheck.isConnected == false` E `ghostSession == true`:
   - Chamar `DELETE /instance/logout/{name}` para limpar a sessao morta
   - Chamar `GET /instance/connect/{name}` para iniciar reconexao limpa
   - Se retornar QR code, marcar como `awaiting_qr`
   - Se retornar "open", marcar como "connected"

5. Tambem incluir instancias com status "connected" na query inicial (linha 273) MAS limitar a verificacao a instancias que nao receberam `messages.upsert` recentemente (usar campo `last_webhook_event`):
   - Adicionar `"connected"` ao `.in("status", ["connecting", "disconnected", "connected"])`
   - Filtrar connected: so verificar se `last_webhook_event = 'connection.update'` (nunca recebeu mensagem)

**Arquivo 2: `supabase/functions/evolution-api/index.ts`**

Nenhuma mudanca necessaria - a logica de logout no "Connection Closed" ja esta implementada corretamente.

### Fluxo Corrigido

```text
Auto-reconnect roda a cada 5 min
  |
  v
Busca instancias: disconnected + connecting + connected(sem mensagens)
  |
  v
Para cada instancia:
  fetchInstances -> "open"?
    |
    SIM -> /instance/connectionState -> "open"?
    |        |
    |        SIM -> DB = "connected" (sessao REAL) -> FIM
    |        |
    |        NAO -> SESSAO FANTASMA detectada!
    |              -> /instance/logout (limpa sessao morta)
    |              -> /instance/connect (reconexao limpa)
    |              -> Aguardar QR ou conexao automatica
    |
    NAO -> Instancia realmente desconectada
          -> /instance/connect (reconexao normal)
```

### Impacto Esperado

| Antes | Depois |
|---|---|
| fetchInstances = "open" -> confia cegamente | fetchInstances + connectionState = verificacao dupla |
| Sessoes fantasma nunca detectadas | Detectadas e reparadas automaticamente |
| 0 instancias qualificam para reconexao | Todas as fantasmas qualificam |
| ZERO messages.upsert | Sessoes limpas -> mensagens fluem |
| Todo envio falha | Envio funciona apos reconexao |

### Arquivos Editados

1. `supabase/functions/auto-reconnect-instances/index.ts` - Adicionar verificacao dupla (fetchInstances + connectionState), incluir instancias "connected" sem mensagens na verificacao, forcar logout antes de reconnect para sessoes fantasma
