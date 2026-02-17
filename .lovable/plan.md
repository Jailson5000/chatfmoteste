

# Correcao: IA nao responde quando recebe PDF (e imagem)

## Causa Raiz Confirmada

Analisei os logs do sistema e encontrei o erro exato:

```
[AI Chat] AI API error (openai-enterprise): {
  "error": {
    "message": "Invalid MIME type. Only image types are supported.",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_image_format"
  }
}
```

O Lovable AI Gateway **nao suporta PDFs** no campo `image_url` -- ele aceita apenas imagens (JPEG, PNG, etc). O codigo atual envia `data:application/pdf;base64,...` como se fosse uma imagem, causando erro 400. Como o fallback so funciona para erros 429/402/500+, o erro 400 faz a funcao retornar silenciosamente sem nenhuma resposta ao cliente.

Alem disso, a imagem enviada antes do PDF tambem nao foi analisada pela IA: imagens sem legenda entram com `messageContent = ""` e nao ha nenhum mecanismo multimodal para imagens.

## Solucao: Extrair texto do PDF no servidor e enviar como texto

Em vez de enviar o PDF binario via `image_url` (que o gateway nao suporta), vamos:

1. **Converter o base64 do PDF em texto** no lado do servidor (edge function)
2. **Enviar o texto extraido** como parte da mensagem de texto normal para a IA
3. **Adicionar suporte a imagens** usando o mesmo mecanismo `image_url` (que o gateway suporta para imagens reais)

### Mudanca 1: `supabase/functions/ai-chat/index.ts`

**Onde**: Linhas 3809-3824 (bloco multimodal atual)

**O que**: 
- Para **PDFs**: Em vez de enviar via `image_url`, decodificar o base64 e extrair texto usando uma abordagem simples (o PDF base64 e pequeno, 15KB neste caso). Enviar o texto extraido como mensagem de texto para a IA.
- Para **imagens**: Usar o campo `image_url` normalmente (o gateway suporta imagens).

```text
// Para PDFs: extrair texto e enviar como contexto textual
if (context?.documentBase64 && context?.documentMimeType?.includes('pdf')) {
  // Decodificar base64 e extrair texto bruto do PDF
  const pdfText = extractTextFromPdfBase64(context.documentBase64);
  const docFileName = context.documentFileName || 'documento.pdf';
  
  messages.push({
    role: "user",
    content: wrapUserInput(
      `[Cliente enviou o documento: ${docFileName}]\n` +
      `Conteudo extraido do PDF:\n---\n${pdfText}\n---\n` +
      `Analise o conteudo deste documento.`
    ),
  });
}
// Para imagens: usar image_url (suportado pelo gateway)
else if (context?.documentBase64 && context?.documentMimeType?.startsWith('image/')) {
  messages.push({
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:${context.documentMimeType};base64,${context.documentBase64}` } },
      { type: "text", text: wrapUserInput(message || '[Cliente enviou uma imagem]') },
    ] as any,
  });
}
else {
  messages.push({ role: "user", content: wrapUserInput(message) });
}
```

### Mudanca 2: Funcao de extracao de texto de PDF

**Onde**: `supabase/functions/ai-chat/index.ts` -- nova funcao auxiliar

**O que**: Funcao simples para extrair texto legivel de um PDF base64. PDFs tem texto embutido que pode ser extraido com regex do stream decodificado. Para PDFs simples (como extratos do INSS), isso funciona bem.

```text
function extractTextFromPdfBase64(base64: string): string {
  try {
    // Decodifica base64 para bytes
    const binaryStr = atob(base64);
    
    // Extrai texto visivel do PDF usando regex em streams de texto
    // Busca por blocos de texto entre BT...ET (Begin Text / End Text)
    const textMatches: string[] = [];
    // Abordagem: extrair strings entre parenteses dentro de operadores Tj/TJ
    const regex = /\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(binaryStr)) !== null) {
      const text = match[1];
      // Filtra apenas texto legivel (ignora binario)
      if (text.length > 1 && /[a-zA-Z0-9À-ú]/.test(text)) {
        textMatches.push(text);
      }
    }
    
    const extractedText = textMatches.join(' ').trim();
    
    if (extractedText.length < 10) {
      return '[Nao foi possivel extrair texto do PDF - pode ser um documento escaneado/imagem]';
    }
    
    // Limitar a 3000 caracteres para nao sobrecarregar o prompt
    return extractedText.substring(0, 3000);
  } catch {
    return '[Erro ao processar conteudo do PDF]';
  }
}
```

### Mudanca 3: Suporte a imagens na fila de debounce

**Onde**: `supabase/functions/evolution-webhook/index.ts` -- linhas 5615-5631

**O que**: Quando `messageType === 'image'`, tambem armazenar o `whatsappMessageKey` para poder baixar o base64 da imagem sob demanda (mesmo mecanismo ja usado para PDFs). Atualizar o processador da fila para tambem baixar imagens.

- No queueamento: armazenar key para imagens tambem
- No processador: quando `messageType` inclui `image`, baixar base64 e passar como `documentBase64` com `documentMimeType: 'image/jpeg'`

### Mudanca 4: Tratar erro 400 como fallback para texto puro

**Onde**: `supabase/functions/ai-chat/index.ts` -- apos o bloco multimodal

**O que**: Se a chamada multimodal falhar com 400 (formato invalido), tentar novamente enviando apenas o texto sem o base64. Isso garante que a IA sempre responda, mesmo que nao consiga processar a midia.

## Resumo

| Mudanca | Arquivo | Impacto |
|---------|---------|---------|
| Extrair texto de PDFs em vez de enviar binario | ai-chat | Corrige erro "Invalid MIME type" |
| Suporte a imagens via image_url | ai-chat | Permite IA analisar imagens |
| Baixar base64 de imagens sob demanda | evolution-webhook | Habilita analise visual |
| Fallback para texto se multimodal falhar | ai-chat | IA sempre responde |

## Resultado Esperado

- PDFs: IA recebe o texto extraido e consegue analisar o conteudo
- Imagens: IA recebe a imagem via multimodal e descreve o que ve
- Se qualquer falha ocorrer, a IA responde normalmente com o nome do arquivo
- Nenhuma mensagem fica sem resposta

