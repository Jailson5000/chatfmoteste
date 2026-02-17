
# Extrair texto de PDFs recebidos para a IA analisar

## Problema Atual

Quando um cliente envia um PDF pelo WhatsApp, a IA recebe apenas o nome do arquivo (ex: "extrato.pdf") como conteudo da mensagem. Ela nao consegue ver o que tem dentro do PDF, entao nao sabe se o documento correto foi enviado.

## Solucao

Usar a capacidade multimodal do Gemini (que suporta PDFs nativamente) para enviar o base64 do PDF junto com a mensagem. O Gemini consegue ler e interpretar PDFs diretamente.

O fluxo sera:

```text
Cliente envia PDF
       |
       v
evolution-webhook detecta documentMessage
       |
       v
Baixa base64 via Evolution API (getBase64FromMediaMessage)
       |
       v
Envia base64 do PDF no contexto para ai-chat
       |
       v
ai-chat monta mensagem multimodal para o Gemini
       |
       v
IA le o conteudo do PDF e responde com contexto
```

## Mudancas Tecnicas

### 1. `supabase/functions/evolution-webhook/index.ts`

**Onde**: Dentro das funcoes `processWithGemini` e `processWithGPT` (linhas ~3150-3170 e ~3312-3334), na chamada para `ai-chat`.

**O que**: Quando `context.messageType === 'document'` e o mime type for PDF (`application/pdf`), baixar o base64 do documento via Evolution API (usando `getBase64FromMediaMessage`, o mesmo endpoint ja usado para audios) e incluir no contexto enviado para `ai-chat`.

- Adicionar campo `documentBase64` e `documentMimeType` e `documentFileName` no `context` da chamada ao ai-chat
- Limitar a 5MB para nao sobrecarregar
- Suportar apenas PDFs inicialmente (DOCX e outros formatos podem ser adicionados depois)

### 2. `supabase/functions/ai-chat/index.ts`

**Onde**: Na construcao das mensagens para o modelo (linhas ~3800-3803), onde a mensagem do usuario e adicionada.

**O que**: Quando `context.documentBase64` estiver presente, montar a mensagem do usuario como conteudo multimodal (array de content parts) em vez de texto simples:

```text
// Em vez de:
messages.push({ role: "user", content: "extrato.pdf" })

// Enviar:
messages.push({ 
  role: "user", 
  content: [
    { 
      type: "image_url", 
      image_url: { url: "data:application/pdf;base64,BASE64_AQUI" } 
    },
    { 
      type: "text", 
      text: "[Cliente enviou o documento: extrato.pdf]\nAnalise o conteudo deste PDF."
    }
  ]
})
```

- Adicionar instrucao no system prompt para que a IA descreva brevemente o que recebeu
- Manter o texto original do usuario (nome do arquivo) como referencia

### 3. Limites de Seguranca

- Tamanho maximo do PDF: 5MB (ja limitado no webhook)
- Apenas `application/pdf` sera processado (outros tipos de documento continuam como antes)
- Se o download do base64 falhar, a IA continua recebendo apenas o nome do arquivo (fallback seguro)
- Timeout de 10s para download do base64

## Resumo

| Mudanca | Arquivo | Risco |
|---------|---------|-------|
| Baixar base64 de PDFs recebidos | evolution-webhook | Baixo -- usa endpoint existente (mesmo do audio) |
| Enviar PDF como conteudo multimodal | ai-chat | Baixo -- formato suportado pelo Gemini |
| Fallback se download falhar | ambos | Zero -- comportamento atual mantido |

## Resultado Esperado

- Quando um cliente enviar um PDF, a IA vai ler o conteudo e responder com contexto (ex: "Recebi o Extrato de Informacoes do Beneficio em nome de Joao Silva...")
- Se o PDF nao puder ser lido, o comportamento atual e mantido (IA recebe so o nome do arquivo)
- Funciona imediatamente com o Gemini via Lovable AI Gateway
