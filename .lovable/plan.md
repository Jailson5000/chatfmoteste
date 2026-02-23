
## Corrigir: Sessoes "Fantasma" - Conectadas mas Nao Funcionam

### Diagnostico Completo (comprovado com chamadas reais)

**Webhook configurado CORRETAMENTE** (verificado via API):
- MESSAGES_UPSERT esta na lista de eventos de TODAS as instancias
- URL com token esta correta
- Webhook esta habilitado

**Porem ZERO eventos `messages.upsert` chegam no webhook.** Apenas `connection.update` com estado `connecting` a cada segundo. Isso comprova que as sessoes Baileys estao ciclando internamente.

**O envio falha com `Connection Closed`** em TODAS as instancias testadas:
```
15:41:28 Background send failed: {"message":["Error: Connection Closed"]}
15:39:35 Background send failed: {"message":["Error: Connection Closed"]}
15:39:16 Background send failed: {"message":["Error: Connection Closed"]}
```

### Causa Raiz: Loop de Estado Falso

O ciclo funciona assim:

```text
1. fetchInstances retorna "open" (cache do Evolution, NAO o estado real do socket)
2. Auto-reconnect confia e marca DB como "connected"
3. Usuario tenta enviar mensagem
4. Evolution retorna "Connection Closed" (socket Baileys esta morto)
5. Codigo marca instancia como "disconnected"
6. Auto-reconnect roda -> fetchInstances retorna "open" NOVAMENTE (cache)
7. Auto-reconnect marca "connected" de novo -> volta ao passo 3
8. Ciclo infinito: connected -> send fails -> disconnected -> auto-reconnect -> connected
```

O `fetchInstances` da Evolution API v2.3.7 reporta o estado do REGISTRO da instancia, nao o estado real do socket Baileys. Quando o socket morre internamente, `fetchInstances` pode continuar reportando "open" por um tempo.

### Solucao: Logout Forcado + Reconnect Limpo

**Quando "Connection Closed" ocorre no envio:**
1. Chamar `/instance/logout` ANTES de marcar como disconnected
2. Isso forca o Evolution a invalidar o registro interno
3. Na proxima execucao, `fetchInstances` retorna "close" (estado correto)
4. Auto-reconnect chama `/instance/connect` legitimamente
5. Sessao Baileys reconecta de forma limpa

```text
// ANTES (loop infinito):
Connection Closed -> marca disconnected -> auto-reconnect ve "open" -> marca connected -> repete

// DEPOIS (reparo real):
Connection Closed -> /instance/logout -> marca disconnected -> auto-reconnect ve "close" 
  -> /instance/connect -> sessao limpa -> mensagens voltam
```

**Por que logout resolve:**
- `/instance/logout` mata a sessao no lado do Evolution (nao so no nosso DB)
- `fetchInstances` passa a reportar "close" corretamente
- Auto-reconnect faz UMA chamada `/instance/connect` (reconexao real)
- Baileys reconecta o socket do zero -> mensagens fluem

### Mudancas Tecnicas

**Arquivo 1: `supabase/functions/evolution-api/index.ts`**

Na logica de "Connection Closed" do `send_message_async` (texto e media):
- ANTES de marcar como disconnected, chamar `GET /instance/logout/{instanceName}`
- Adicionar tratamento de erro para o logout (nao bloquear se falhar)
- Adicionar rate-limit: so fazer logout se a instancia NAO foi marcada como disconnected nos ultimos 2 minutos (evitar multiplos logouts simultaneos)

Tambem corrigir o log inicial enganoso:
- Linha 531: mudar para incluir `conversationId` quando `instanceId` esta vazio

**Arquivo 2: `supabase/functions/auto-reconnect-instances/index.ts`**

Nenhuma mudanca necessaria - a logica atual ja esta correta:
- Se fetchInstances retorna "open" -> marca connected (correto para sessoes funcionais)
- Se fetchInstances retorna "close" -> chama /instance/connect (correto para sessoes mortas)
- Apos o logout forcado, fetchInstances vai retornar "close", ativando a reconexao real

### Fluxo Corrigido Completo

```text
1. Usuario envia mensagem
2. Evolution retorna "Connection Closed"
3. Edge function chama /instance/logout (mata sessao no Evolution)
4. Edge function marca DB como "disconnected"
5. Mensagem marcada como "failed" para o usuario
6. Auto-reconnect roda (1 min depois)
7. fetchInstances retorna "close" (correto apos logout)
8. Auto-reconnect chama /instance/connect (reconexao REAL)
9. Baileys reconecta socket WhatsApp
10. Webhook recebe connection.update state=open
11. Instancia marcada como "connected" (estado real)
12. messages.upsert voltam a chegar
13. Proximo envio funciona normalmente
```

### Impacto

| Antes | Depois |
|---|---|
| fetchInstances retorna "open" mesmo com socket morto | Logout forca Evolution a reportar estado correto |
| Loop infinito connected/disconnected | Ciclo quebrado: logout -> reconnect real -> funciona |
| ZERO messages.upsert | Mensagens voltam apos reconnect limpo |
| Send sempre falha com Connection Closed | Send funciona apos reconexao automatica |
| Auto-reconnect nao consegue reconectar (ve "open") | Auto-reconnect reconecta de verdade (ve "close") |

### Arquivos Editados

1. `supabase/functions/evolution-api/index.ts` - Adicionar /instance/logout antes de marcar disconnected no Connection Closed (texto e media)
