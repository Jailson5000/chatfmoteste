

# Correção: PDFs Encaminhados Não Aparecem no Chat

## Problema Identificado

Quando um cliente **encaminha** (forward) um PDF pelo WhatsApp, o documento não é salvo no banco de dados e aparece como uma caixa vazia no chat. O PDF enviado diretamente funciona normalmente.

Evidência no banco de dados:
- PDF direto (17:22) -- salvo corretamente com `message_type: document`, `media_mime_type: application/pdf`
- PDF encaminhado (19:44) -- completamente ausente do banco de dados

## Causa Raiz

Quando uma mensagem é encaminhada no WhatsApp, a Evolution API envia o payload com `messageType: "senderKeyDistributionMessage"` no nível superior, mas o conteúdo real (ex: `documentMessage`) continua dentro de `data.message`. O código atual detecta corretamente via `data.message.documentMessage`, porém há um problema: mensagens encaminhadas frequentemente incluem um campo `data.message.senderKeyDistributionMessage` que pode interferir, ou o payload chega em formato ligeiramente diferente.

Além disso, há outra estrutura possível para mensagens encaminhadas: `data.message.ephemeralMessage.message.documentMessage` -- onde o documento é encapsulado dentro de um wrapper efêmero.

## Correção

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

#### 1. Adicionar unwrapping de mensagens encaminhadas/efêmeras

Antes do bloco de detecção de tipo (linha ~4820), adicionar lógica para "desempacotar" mensagens que vêm encapsuladas em containers de encaminhamento:

```text
// ANTES do bloco if/else if de detecção de tipo:
// Unwrap forwarded/ephemeral message containers
// Forwarded docs may come wrapped in ephemeralMessage or 
// senderKeyDistributionMessage containers
let messageData = data.message;

if (messageData && !messageData.conversation && !messageData.extendedTextMessage) {
  // Check ephemeralMessage wrapper (common for forwarded messages)
  if (messageData.ephemeralMessage?.message) {
    messageData = messageData.ephemeralMessage.message;
    logDebug('MESSAGE', 'Unwrapped ephemeralMessage container', { requestId });
  }
  // Check viewOnceMessage wrapper
  if (messageData.viewOnceMessage?.message) {
    messageData = messageData.viewOnceMessage.message;
    logDebug('MESSAGE', 'Unwrapped viewOnceMessage container', { requestId });
  }
  // Check viewOnceMessageV2 wrapper
  if (messageData.viewOnceMessageV2?.message) {
    messageData = messageData.viewOnceMessageV2.message;
    logDebug('MESSAGE', 'Unwrapped viewOnceMessageV2 container', { requestId });
  }
}
```

Depois, usar `messageData` em vez de `data.message` em todas as verificações de tipo.

#### 2. Melhorar o logging do fallback

No bloco de fallback (linha ~5233), adicionar log mais detalhado para capturar formatos desconhecidos futuros:

```text
logDebug('UNKNOWN_TYPE', 'Message type not recognized', {
  requestId,
  messageKeys: Object.keys(data.message).join(','),
  evolutionMessageType: data.messageType,  // <-- ADICIONAR
  rawPreview: rawMessage.slice(0, 800),     // <-- AUMENTAR de 500 para 800
});
```

#### 3. Adicionar tipos ao interface EvolutionMessage

Adicionar os wrappers na interface de tipos:

```text
ephemeralMessage?: {
  message?: EvolutionMessage['message'];
};
viewOnceMessage?: {
  message?: EvolutionMessage['message'];
};
viewOnceMessageV2?: {
  message?: EvolutionMessage['message'];
};
senderKeyDistributionMessage?: Record<string, unknown>;
```

## Resumo

| Mudança | Arquivo | Risco |
|---------|---------|-------|
| Unwrap mensagens encaminhadas/efêmeras | evolution-webhook | Baixo -- fallback seguro para formato atual |
| Melhorar logging de formatos desconhecidos | evolution-webhook | Zero |
| Adicionar tipos de wrapper | evolution-webhook | Zero |

## Resultado Esperado

- PDFs encaminhados serão corretamente detectados e salvos no banco
- Mensagens "view once" (visualização única) também serão tratadas
- Logging melhorado para capturar qualquer formato futuro não reconhecido
- Nenhuma mudança no comportamento de mensagens que já funcionam

