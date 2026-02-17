


# Correcao: IA nao responde quando recebe PDF (e imagem) - IMPLEMENTADO ✅

## Mudancas Implementadas

### 1. Extracao de texto de PDFs (ai-chat)
- Adicionada funcao `extractTextFromPdfBase64()` que extrai texto legivel de PDFs via regex
- PDFs agora sao enviados como texto para a IA (em vez de binary via image_url que causava erro 400)

### 2. Suporte multimodal para imagens (ai-chat)
- Imagens agora usam `image_url` corretamente (gateway suporta image MIME types)
- Imagens sem legenda recebem placeholder "[Cliente enviou uma imagem]"

### 3. Fallback para erro 400 (ai-chat)
- Se chamada multimodal falhar com 400, retenta automaticamente com texto puro
- Garante que a IA sempre responda, mesmo se a midia nao puder ser processada

### 4. Download on-demand de imagens (evolution-webhook)
- `whatsappMessageKey` agora eh armazenado para imagens tambem (alem de PDFs)
- Queue processor baixa base64 de imagens sob demanda (mesmo mecanismo dos PDFs)

## Status: Deployed ✅
