

## Corrigir Ciclo de Desconexao de Instancias WhatsApp

### Problema Raiz

Quando uma mensagem falha com "Connection Closed", o sistema reage de forma excessivamente agressiva:

1. Marca a instancia como `disconnected` (status mais grave)
2. Dispara `/instance/connect` imediatamente no background
3. O cron `auto-reconnect-instances` tambem detecta e tenta reconectar
4. Multiplas chamadas simultaneas ao servidor Evolution API sobrecarregam o servidor
5. Isso causa desconexao em cascata de OUTRAS instancias no mesmo servidor

Os logs mostram o padrao claro: instancias desconectando em sequencia (14:20 → 14:23 → 14:26), todas no mesmo servidor `evo.fmoadv.com.br`.

### Correcoes

**Arquivo: `supabase/functions/evolution-api/index.ts`**

**1. Trocar status de `disconnected` para `connecting` no erro "Connection Closed"**

O erro "Connection Closed" e transiente - a Evolution API geralmente reconecta sozinha em 2-5 segundos. Marcar como `disconnected` e excessivo e dispara alertas desnecessarios.

Mudar linhas ~1997-2007:

```text
// ANTES:
status: 'disconnected'
disconnected_since: new Date().toISOString()

// DEPOIS:
status: 'connecting'
// NAO setar disconnected_since para erros transientes
```

**2. Remover a reconexao imediata no background**

Remover as linhas ~2010-2019 que chamam `/instance/connect` diretamente no handler de erro do envio. Deixar que o cron `auto-reconnect-instances` cuide disso de forma controlada (ele ja roda a cada 5 minutos e tem logica de throttling).

**3. Adicionar retry com delay antes de falhar**

Antes de declarar o envio como falho e marcar a instancia, tentar novamente UMA vez apos 3 segundos de espera. Muitas vezes o "Connection Closed" e momentaneo e a segunda tentativa funciona.

```text
// Pseudocodigo:
if (isConnectionClosed && !isRetry) {
  await new Promise(r => setTimeout(r, 3000)); // esperar 3 segundos
  // Tentar enviar novamente (mesma chamada)
  const retryResponse = await fetch(sendUrl, ...);
  if (retryResponse.ok) {
    // Sucesso na segunda tentativa - nao marcar nada
    return;
  }
  // Se falhou de novo, ai sim marcar como connecting
}
```

**4. Proteger contra marcacao duplicada**

Antes de atualizar o status, verificar se a instancia ja esta como `connecting` ou `disconnected` para evitar updates desnecessarios que geram webhooks extras.

### Detalhes Tecnicos

No `backgroundSend` (linhas ~1988-2046), substituir o bloco de tratamento de "Connection Closed" por:

```text
if (isConnectionClosed && instanceId) {
  // RETRY: Esperar 3s e tentar novamente (erro pode ser transiente)
  console.warn(`[Evolution API] Connection Closed for ${instanceId} - retrying in 3s...`);
  await new Promise(resolve => setTimeout(resolve, 3000));

  const retryResponse = await fetch(
    `${apiUrl}/message/sendText/${instance.instance_name}`,
    {
      method: "POST",
      headers: { apikey: instance.api_key || "", "Content-Type": "application/json" },
      body: JSON.stringify(sendPayload),
    }
  );

  if (retryResponse.ok) {
    // Sucesso no retry!
    const retryData = await retryResponse.json();
    const retryWhatsAppId = retryData.key?.id || retryData.messageId || retryData.id;
    console.log(`[Evolution API] Retry succeeded! whatsapp_message_id: ${retryWhatsAppId}`);
    if (conversationId && retryWhatsAppId) {
      await supabaseClient.from("messages")
        .update({ whatsapp_message_id: retryWhatsAppId, status: "sent" })
        .eq("id", tempMessageId);
    }
    return; // Nao marcar instancia como desconectada
  }

  // Retry tambem falhou - marcar como CONNECTING (nao disconnected)
  console.error(`[Evolution API] Retry also failed for ${instanceId} - marking as connecting`);
  await supabaseClient
    .from("whatsapp_instances")
    .update({ status: 'connecting', updated_at: new Date().toISOString() })
    .eq("id", instanceId)
    .neq("status", "disconnected"); // Nao sobrescrever se ja esta pior

  // NAO chamar /instance/connect aqui - deixar o cron cuidar
  errorReason = "Conexao temporariamente indisponivel. Tentando reconectar...";
}
```

A mesma logica de retry deve ser aplicada no bloco de envio de midia (linhas ~1894-1911) que tambem pode receber "Connection Closed".

### Resumo das Mudancas

| O que muda | Antes | Depois |
|---|---|---|
| Status no erro | `disconnected` | `connecting` |
| Reconexao imediata | Sim (`/instance/connect` no handler) | Nao (deixar cron) |
| Retry antes de falhar | Nenhum | 1 tentativa apos 3s |
| `disconnected_since` | Setado imediatamente | Nao alterado (erro transiente) |

### Impacto Esperado

- Elimina o efeito cascata de desconexoes entre instancias
- Reduz chamadas ao servidor Evolution API (menos sobrecarga)
- Mensagens com falha transiente serao entregues no retry automatico
- O cron `auto-reconnect-instances` continua como fallback para desconexoes reais

### Arquivo editado

- `supabase/functions/evolution-api/index.ts`

