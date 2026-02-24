

# Corrigir fluxo de IA no webhook Uazapi

## Problema identificado

O log mostra claramente o erro:

```
ERROR [1780721b] Missing required fields { conversationId: true, message: "undefined" }
```

O uazapi-webhook chama o `ai-chat` com dados **incompletos**. Comparando com o evolution-webhook:

| Campo | evolution-webhook | uazapi-webhook (atual) |
|---|---|---|
| `message` | `context.messageContent` (texto real) | **NÃO ENVIA** |
| `automationId` | `automation.id` | **NÃO ENVIA** |
| `context.clientName` | sim | **NÃO ENVIA** |
| `context.clientPhone` | sim | **NÃO ENVIA** |
| `context.lawFirmId` | sim | **NÃO ENVIA** |
| `context.clientId` | sim | **NÃO ENVIA** |
| `context.skipSaveUserMessage` | `true` | **NÃO ENVIA** |
| `context.skipSaveAIResponse` | `true` | **NÃO ENVIA** |
| Enviar resposta ao WhatsApp | `sendAIResponseToWhatsApp()` | **NÃO FAZ** |
| Salvar mensagem da IA | sim | **NÃO FAZ** |

O bloco atual (linhas 936-970) é basicamente um stub que:
1. Não envia o texto da mensagem (`message` = undefined)
2. Não envia o `automationId` (obrigatório)
3. Não trata a resposta do ai-chat (não envia de volta ao WhatsApp)
4. Não salva a mensagem da IA no banco

## Solução

**Arquivo:** `supabase/functions/uazapi-webhook/index.ts` (linhas 936-970)

Reescrever o bloco "TRIGGER AI PROCESSING" para replicar a lógica completa do evolution-webhook:

1. **Enviar dados corretos ao ai-chat**: incluir `message` (o texto real da variável `content`), `automationId` (do campo `current_automation_id`), e o objeto `context` completo com `skipSaveUserMessage: true` e `skipSaveAIResponse: true`

2. **Aguardar a resposta do ai-chat**: trocar o `fetch().catch()` fire-and-forget por um `await fetch()` com tratamento da resposta

3. **Enviar resposta ao WhatsApp via uazapi**: usar a API `/send/text` do uazapi (headers: `token: apiKey`) para enviar a resposta da IA de volta ao cliente

4. **Salvar mensagem da IA no banco**: inserir a resposta como uma nova mensagem com `sender_type: "ai"`, `ai_generated: true`

5. **Atualizar `last_message_at`** da conversa

A lógica simplificada (sem voice/delay por enquanto — equivalente ao mínimo funcional):

```typescript
// ---- TRIGGER AI PROCESSING ----
if (!isFromMe && content) {
  const { data: conv } = await supabaseClient
    .from("conversations")
    .select("current_handler, current_automation_id")
    .eq("id", conversationId)
    .single();

  if (conv?.current_handler === "ai" && conv?.current_automation_id) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      
      const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          conversationId,
          message: content,                    // ← TEXTO REAL
          automationId: conv.current_automation_id, // ← OBRIGATÓRIO
          source: "whatsapp",
          context: {
            clientName: contactName,
            clientPhone: phoneNumber,
            lawFirmId,
            clientId: resolvedClientId,
            skipSaveUserMessage: true,
            skipSaveAIResponse: true,
          },
        }),
      });

      if (aiResponse.ok) {
        const result = await aiResponse.json();
        const aiText = result.response;

        if (aiText && instance.api_url && instance.api_key) {
          // Send AI response to WhatsApp via uazapi
          const apiUrl = instance.api_url.replace(/\/+$/, "");
          const targetNumber = remoteJid.replace("@s.whatsapp.net", "");
          
          const sendRes = await fetch(`${apiUrl}/send/text`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              token: instance.api_key,
            },
            body: JSON.stringify({ number: targetNumber, text: aiText }),
          });

          const sendData = await sendRes.json().catch(() => ({}));
          const aiMsgId = sendData?.key?.id || sendData?.id || crypto.randomUUID();

          // Save AI message to database
          await supabaseClient.from("messages").insert({
            conversation_id: conversationId,
            whatsapp_message_id: aiMsgId,
            content: aiText,
            message_type: "text",
            is_from_me: true,
            sender_type: "ai",
            ai_generated: true,
            law_firm_id: lawFirmId,
          });

          // Update conversation timestamp
          await supabaseClient
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId);
        }
      }
    } catch (aiErr) {
      console.warn("[UAZAPI_WEBHOOK] AI processing error:", aiErr);
    }
  }
}
```

## Detalhes técnicos

- A chamada usa `await` em vez de fire-and-forget para poder processar a resposta
- O uazapi usa endpoint `/send/text` com header `token` (diferente do Evolution que usa `/message/sendText/` com `apikey`)
- `skipSaveUserMessage: true` porque a mensagem do cliente já foi salva pelo webhook
- `skipSaveAIResponse: true` porque o webhook salva após enviar ao WhatsApp (garante que o `whatsapp_message_id` real seja registrado)

## Impacto

- **Corrige**: IA não responder em conversas via uazapi
- **Risco baixo**: só altera o bloco de trigger de IA, não afeta recebimento de mensagens
- **Compatível**: não altera o fluxo do evolution-webhook

## Arquivo alterado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Reescrever bloco AI trigger (linhas 936-970) com chamada completa ao ai-chat + envio da resposta ao WhatsApp + salvamento da mensagem |

