
## Corrigir: Auto-Reconnect Esta Destruindo as Sessoes do WhatsApp

### Diagnostico Completo com Provas dos Logs

**Problema central: O auto-reconnect chama `/instance/connect` em instancias JA CONECTADAS, reiniciando as sessoes Baileys a cada 5 minutos.**

O endpoint `/instance/connect` NAO e um "status check" - e uma ACAO que forca o Baileys a reconectar o socket WhatsApp. Chamar isso em uma instancia ja conectada REINICIA a sessao inteira.

**Prova nos logs (15:20):**
```
fetchInstances state for inst_0gkejsc5: open (connected: true)     <-- JA CONECTADA
Instance inst_0gkejsc5 reports connected - verifying with /instance/connect...
/instance/connect returned state=undefined - not fully connected   <-- RESPOSTA NAO ENTENDIDA
Socket NOT verified - will proceed with reconnect attempt
Attempting connect for inst_0gkejsc5...                            <-- SEGUNDA chamada!
Connect initiated for inst_0gkejsc5, state: undefined              <-- SESSAO REINICIADA
```

Resultado: **2 chamadas `/instance/connect` por instancia** x 3 instancias = **6 reinicializacoes de socket** a cada 5 minutos.

**Prova de que mensagens NAO fluem:**
- ZERO eventos `messages.upsert` nos logs do webhook (pesquisa vazia)
- Webhook config mostra MESSAGES_UPSERT na lista de eventos (configuracao CORRETA)
- Webhook URL com token esta CORRETO
- Eventos `connection.update` CHEGAM normalmente (conectividade OK)
- Envio de mensagem as 15:22: `"Error: Connection Closed"` (sessao morta)

**Prova de inconsistencia awaiting_qr:**
```
inst_7sw6k99c: status=awaiting_qr no banco, mas conectada no Evolution
```
O webhook recebeu evento `state: qr` que foi gerado pelo proprio `/instance/connect` desnecessario. A instancia ESTAVA conectada ate o auto-reconnect chamar `/instance/connect` e forcar uma reconexao que pediu novo QR.

### Cadeia Causal Completa

```text
Auto-reconnect roda a cada 5 min
  |
  v
fetchInstances diz "open" (correto)
  |
  v
Codigo chama /instance/connect para "verificar" (ERRADO - isso REINICIA a sessao)
  |
  v
Baileys reinicia socket WhatsApp
  |
  v
Flood de eventos "connecting" no webhook
  |
  v
Algumas instancias pedem QR (sessao expirada pela reinicializacao)
  |
  v
Sockets NUNCA estabilizam por mais de 5 min
  |
  v
messages.upsert NUNCA chegam (Baileys nao processa msgs durante reconexao)
  |
  v
Envio falha com "Connection Closed" (socket em transicao)
  |
  v
Retry chama /instance/connect DE NOVO (mais uma reinicializacao)
  |
  v
Ciclo infinito - ZERO mensagens entram ou saem
```

### Solucao

**Arquivo 1: `supabase/functions/auto-reconnect-instances/index.ts`**

Remover completamente a "verificacao" via `/instance/connect`. Quando `fetchInstances` retorna `connectionStatus: "open"`, confiar e atualizar o banco diretamente.

Mudar linhas 374-453: remover todo o bloco que chama `/instance/connect` para verificacao.

```text
// ANTES (bugado):
if (connectionCheck.isConnected) {
  // "Verifica" chamando /instance/connect -> REINICIA SESSAO
  const verifyRes = await fetch(`/instance/connect/${name}`);  
  // response nao entendida -> socketVerified = false
  // cai no attemptConnect -> REINICIA SESSAO DE NOVO
}

// DEPOIS (correto):
if (connectionCheck.isConnected) {
  // fetchInstances disse "open" - confiar e atualizar DB
  await supabaseClient.from("whatsapp_instances").update({
    status: "connected",
    disconnected_since: null,
    reconnect_attempts_count: 0,
    awaiting_qr: false,
    manual_disconnect: false,
    updated_at: now.toISOString(),
  }).eq("id", instance.id);
  
  results.push({ success: true, action: "status_sync", message: "DB synced with Evolution API" });
  continue; // PARAR AQUI - nao chamar /instance/connect
}
```

**Arquivo 2: `supabase/functions/evolution-api/index.ts`**

No retry de "Connection Closed" do envio de mensagens: remover a chamada `/instance/connect` antes do retry. Simplesmente esperar 3 segundos e tentar de novo. Se falhar, marcar como disconnected e deixar o auto-reconnect lidar.

```text
// ANTES (bugado):
if (isConnectionClosed) {
  await fetch(`/instance/connect/${name}`);  // REINICIA SESSAO
  await sleep(5000);
  // retry mensagem
}

// DEPOIS (correto):
if (isConnectionClosed) {
  // Marcar como disconnected para o auto-reconnect lidar
  await supabaseClient.from("whatsapp_instances").update({
    status: "disconnected",
    disconnected_since: new Date().toISOString(),
  }).eq("id", instanceId);
  
  // NAO chamar /instance/connect aqui - causa mais instabilidade
  // Retornar erro para o usuario saber que a mensagem nao foi enviada
}
```

### Logica Final do Auto-Reconnect

```text
Situacao                    | Acao
----------------------------|------------------------------------
fetchInstances = "open"     | Atualizar DB para "connected". FIM.
fetchInstances = "close"    | Chamar /instance/connect (unico caso)
fetchInstances = error/404  | Marcar como "not_found_in_evolution"
DB = "awaiting_qr"          | IGNORAR (usuario precisa escanear QR)
DB = "manual_disconnect"    | IGNORAR (usuario desconectou)
```

### Impacto Esperado

| Antes | Depois |
|---|---|
| 6+ chamadas /instance/connect a cada 5 min | ZERO chamadas desnecessarias |
| Sessoes Baileys reiniciadas constantemente | Sessoes permanecem estaveis |
| ZERO eventos messages.upsert | Mensagens voltam a fluir |
| "Connection Closed" em todo envio | Envio funciona normalmente |
| inst_7sw6k99c "awaiting_qr" falso | Status correto (connected) |
| Plataforma mostra status fake | Status reflete realidade |

### Arquivos Editados

1. `supabase/functions/auto-reconnect-instances/index.ts` - Remover verificacao via /instance/connect, confiar em fetchInstances
2. `supabase/functions/evolution-api/index.ts` - Remover /instance/connect do retry de envio de mensagem
