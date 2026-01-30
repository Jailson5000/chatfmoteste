
# Correção: Mensagens WABA com Templates Não Aparecem no Sistema

## Diagnóstico

Mensagens enviadas via API Oficial do WhatsApp (WABA) usando templates de marketing não estão sendo exibidas porque o webhook não extrai o conteúdo deste tipo de mensagem.

### Evidência do Banco de Dados

A mensagem chegou com conteúdo vazio:
```sql
content: '' (vazio)
message_type: 'text'
whatsapp_message_id: '75CB20B6BA140FA2A6'
```

### Payload Real Recebido

O webhook recebeu corretamente:
```json
{
  "message": {
    "templateMessage": {
      "templateId": "2198726087325649",
      "hydratedTemplate": {
        "hydratedContentText": "Olá, tudo bem? Aqui é da *Assis & Mollerke...",
        "imageMessage": { "url": "...", "mimetype": "image/jpeg" },
        "hydratedButtons": [
          { "quickReplyButton": { "displayText": "Saber mais" } },
          { "quickReplyButton": { "displayText": "Bloquear Empresa" } },
          { "quickReplyButton": { "displayText": "Sim, continuar" } }
        ]
      }
    }
  }
}
```

### Problema no Código

O código em `evolution-webhook/index.ts` (linhas 4057-4250) NÃO trata `templateMessage`:

```typescript
if (data.message?.conversation) {
  messageContent = data.message.conversation;
} else if (data.message?.extendedTextMessage?.text) {
  messageContent = data.message.extendedTextMessage.text;
} else if (data.message?.imageMessage) { ... }
// ... outros tipos
// FALTA: templateMessage!
```

---

## Solução

Adicionar extração de `templateMessage` no webhook, extraindo:
1. `hydratedContentText` - O texto principal da mensagem
2. `imageMessage` (opcional) - Se o template tiver imagem, tratar como mídia
3. `hydratedButtons` - Listar as opções de botões no final do texto

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/evolution-webhook/index.ts` | Adicionar extração de `templateMessage` |

---

## Código da Correção

### evolution-webhook/index.ts - Adicionar suporte a templateMessage

Após a linha 4250 (depois do bloco `interactiveResponseMessage`), adicionar:

```typescript
} else if (data.message?.templateMessage) {
  // WABA: Template message (marketing/utility templates with text, image, buttons)
  const template = data.message.templateMessage;
  const hydrated = template.hydratedTemplate;
  
  if (hydrated) {
    // Extract main text content
    messageContent = hydrated.hydratedContentText || '';
    
    // Check if template has image
    if (hydrated.imageMessage) {
      messageType = 'image';
      mediaUrl = hydrated.imageMessage.url || '';
      mediaMimeType = hydrated.imageMessage.mimetype || 'image/jpeg';
    } else if (hydrated.videoMessage) {
      messageType = 'video';
      mediaUrl = hydrated.videoMessage.url || '';
      mediaMimeType = hydrated.videoMessage.mimetype || 'video/mp4';
    } else if (hydrated.documentMessage) {
      messageType = 'document';
      mediaUrl = hydrated.documentMessage.url || '';
      mediaMimeType = hydrated.documentMessage.mimetype || 'application/octet-stream';
    }
    
    // Append button options to content for context
    if (hydrated.hydratedButtons && Array.isArray(hydrated.hydratedButtons)) {
      const buttonTexts = hydrated.hydratedButtons
        .map((btn: any) => {
          if (btn.quickReplyButton?.displayText) return btn.quickReplyButton.displayText;
          if (btn.urlButton?.displayText) return btn.urlButton.displayText;
          if (btn.callButton?.displayText) return btn.callButton.displayText;
          return null;
        })
        .filter(Boolean);
      
      if (buttonTexts.length > 0) {
        messageContent += '\n\n[Opções: ' + buttonTexts.join(' | ') + ']';
      }
    }
  } else if (template.fourRowTemplate) {
    // Older template format (fourRowTemplate)
    messageContent = template.fourRowTemplate.content?.namespace || 
                     template.fourRowTemplate.hydratedContentText || 
                     '[Mensagem de template]';
  } else {
    messageContent = '[Mensagem de template]';
  }
  
  logDebug('WABA_TEMPLATE', 'Template message processed', { 
    requestId, 
    templateId: template.templateId || hydrated?.templateId,
    hasImage: !!mediaUrl,
    contentLength: messageContent.length,
    buttonCount: hydrated?.hydratedButtons?.length || 0
  });
}
```

### Também atualizar a interface MessageData (linha ~713)

Adicionar tipo para templateMessage:

```typescript
templateMessage?: {
  templateId?: string;
  hydratedTemplate?: {
    templateId?: string;
    hydratedContentText?: string;
    imageMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
    };
    videoMessage?: {
      url?: string;
      mimetype?: string;
      caption?: string;
    };
    documentMessage?: {
      url?: string;
      mimetype?: string;
      fileName?: string;
    };
    hydratedButtons?: Array<{
      index?: number;
      quickReplyButton?: { displayText?: string; id?: string };
      urlButton?: { displayText?: string; url?: string };
      callButton?: { displayText?: string; phoneNumber?: string };
    }>;
  };
  fourRowTemplate?: {
    content?: { namespace?: string };
    hydratedContentText?: string;
  };
};
```

---

## Resultado Esperado

Após a correção, a mensagem aparecerá como:

**Tipo:** `image` (se tiver imagem) ou `text`  
**Conteúdo:**
```
Olá, tudo bem? Aqui é da *Assis & Mollerke Assessoria*, parceira oficial da *Autêntica Certificadora (ICP-Brasil)*.

Conforme consulta, verificamos que a empresa J NERES RODRIGUES FERREIRA LTDA CNPJ: 64.774.567/0001-06 está apta para *emissão do Certificado Digital A1 100% online*, com validação por videochamada e sem deslocamento.

O processo é rápido, seguro e autorizado pela ICP-Brasil. Podemos seguir com o seu certificado digital?

Posso indicar o seu CNPJ e te mostrar como funciona a conta?

[Opções: Saber mais | Bloquear Empresa | Sim, continuar]
```

---

## Checklist de Validação

- [ ] Mensagens WABA com templates aparecem no sistema
- [ ] Texto do template é extraído corretamente
- [ ] Imagem do template é exibida (se houver)
- [ ] Botões do template são listados no final
- [ ] Mensagens normais (QR Code/Baileys) continuam funcionando
