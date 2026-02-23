
## Corrigir "Connection Closed" no Envio de Mensagens

### Diagnostico Completo (com provas dos logs)

**Estado atual do banco:** Instancias marcadas como `connected` e `connecting` alternando constantemente.

**O que acontece passo a passo (comprovado nos logs):**

```text
15:05:09 - auto-reconnect: fetchInstances = "open" -> marca DB como "connected" (CORRETO)
15:05:22 - webhook: evento "connecting" recebido -> IGNORADO (nosso fix funciona!)
15:06:10 - usuario envia mensagem via inst_0gkejsc5
15:06:11 - Evolution retorna: {"message":["Error: Connection Closed"]}
15:06:14 - retry apos 3s tambem falha -> marca DB como "disconnected"
15:06:14 - frontend ve "disconnected" -> mostra banner vermelho "WhatsApp desconectado"
```

**Causa raiz:** A Evolution API v2.3.7 (Baileys) tem um bug onde `fetchInstances` reporta `connectionStatus: "open"` mas o socket WebSocket interno do WhatsApp esta quebrado. Quando se tenta enviar via `/message/sendText`, retorna "Connection Closed".

O auto-reconnect ve "open" e apenas atualiza o banco sem verificar se o socket realmente funciona. A mensagem falha, marca como `disconnected`, e o ciclo recomeça.

### Solucao em 2 Partes

**Parte 1: Reconexao inteligente no envio (evolution-api/index.ts)**

Quando "Connection Closed" ocorrer no envio de mensagem:
1. Chamar `/instance/connect` para forcar o Baileys a reconectar o socket WhatsApp
2. Esperar 5 segundos para a reconexao
3. Tentar enviar a mensagem novamente
4. So marcar como `disconnected` se a reconexao + retry tambem falharem

```text
// ANTES (atual):
Connection Closed -> espera 3s -> retry direto -> falha -> marca disconnected

// DEPOIS (corrigido):
Connection Closed -> chama /instance/connect -> espera 5s -> retry -> 
  se sucesso: marca connected, mensagem enviada
  se falha: marca disconnected (desconexao real)
```

**Parte 2: Auto-reconnect verifica conexao real (auto-reconnect-instances/index.ts)**

Quando `fetchInstances` retorna "open" mas a instancia estava em `connecting`/`disconnected`:
1. Chamar `/instance/connect` para garantir que o socket esta ativo
2. So entao marcar como `connected` no banco
3. Isto previne o cenario onde "open" no fetchInstances nao significa socket funcional

```text
// ANTES:
fetchInstances = "open" -> atualiza DB para "connected" (sem verificar socket)

// DEPOIS:
fetchInstances = "open" -> chama /instance/connect -> verifica resposta -> 
  se state "open"/"connected": marca connected
  se retorna QR: marca awaiting_qr
```

### Arquivos Editados

1. `supabase/functions/evolution-api/index.ts` - Adicionar chamada a `/instance/connect` antes do retry no caso "Connection Closed" (tanto em send_message_async quanto send_message)
2. `supabase/functions/auto-reconnect-instances/index.ts` - Chamar `/instance/connect` quando fetchInstances retorna "open" para garantir socket funcional

### Impacto Esperado

| Antes | Depois |
|---|---|
| "Connection Closed" -> retry falha -> marca disconnected | "Connection Closed" -> reconnect socket -> retry com sucesso |
| auto-reconnect confia em fetchInstances "open" | auto-reconnect forca reconexao real do socket |
| Instancias flip-flop connected/disconnected a cada mensagem | Instancias estabilizam apos primeira reconexao |
| Mensagens falham constantemente | Mensagens entregues apos reconexao automatica transparente |
| Banner vermelho aparece a cada envio | Banner so aparece se desconexao real confirmada |
