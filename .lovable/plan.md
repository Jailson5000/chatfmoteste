

# Correcao: IA Nao Le PDFs - Remover Extracao Falha e Usar Abordagem Pratica

## Problema

A extracao de texto de PDFs via regex NAO funciona para PDFs reais. O log mostra "extracted 3000 chars" mas esses 3000 caracteres sao lixo binario (nomes de fontes, metadados PDF, strings de encoding) que a IA nao consegue interpretar. Por isso ela ignora o documento e repete a resposta anterior.

A abordagem de regex `\(([^)]+)\)` captura QUALQUER string entre parenteses no binario do PDF, incluindo:
- Nomes de fontes: `(TrueType)`, `(Arial-BoldMT)`
- Metadados: `(D:20260217)`, `(Adobe PDF Library)`
- Encoding tables: `(A)`, `(B)`, `(space)`
- Texto real misturado com lixo

## Solucao: Duas mudancas simples

### 1. Remover a extracao de texto por regex (nao funciona)

Eliminar a funcao `extractTextFromPdfBase64()` do `ai-chat/index.ts`. Ela da falsa impressao de funcionar (logs mostram "extracted 3000 chars") mas o texto extraido e ilegivel.

### 2. Quando receber PDF, informar a IA sobre o documento sem tentar le-lo

Em vez de enviar texto garbled, enviar uma mensagem clara para a IA:

```text
[Cliente enviou um documento PDF: 122.pdf]
Voce nao tem capacidade de ler o conteudo deste PDF diretamente.
Confirme o recebimento do documento ao cliente e continue o atendimento normalmente.
```

Isso permite que a IA:
- Confirme que recebeu o documento
- Continue o fluxo de atendimento (ex: "Recebi o documento 122.pdf! Vou encaminhar para analise")
- NAO fique silenciosa como esta acontecendo agora

### Arquivo: `supabase/functions/ai-chat/index.ts`

**Mudanca 1** - Remover a funcao `extractTextFromPdfBase64` (linhas 15-46)

**Mudanca 2** - Simplificar o bloco de PDF (linhas 3844-3856):

```text
if (context?.documentBase64 && context?.documentMimeType?.includes('pdf')) {
  const docFileName = context.documentFileName || 'documento.pdf';
  console.log(`[AI Chat] PDF received: ${docFileName} (text extraction not supported)`);
  messages.push({
    role: "user",
    content: wrapUserInput(
      `[Cliente enviou um documento PDF: ${docFileName}]\n` +
      (message ? message : 'Confirme o recebimento do documento e continue o atendimento.')
    ),
  });
}
```

Nao precisamos mais baixar o base64 do PDF para a IA, entao tambem podemos simplificar o queue processor para nao baixar PDF base64 (apenas imagens). Porem isso e opcional -- o download simplesmente nao sera usado.

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

**Mudanca 3** - No processador da fila, nao baixar base64 de PDFs (so imagens):

Alterar a condicao na linha ~1488 de:
```text
if ((documentMimeType === 'application/pdf' || documentMimeType?.startsWith('image/')) && whatsappMessageKey)
```
Para:
```text
if (documentMimeType?.startsWith('image/') && whatsappMessageKey)
```

Isso evita download desnecessario de PDFs que a IA nao consegue processar.

## Resumo

| Mudanca | Arquivo | Impacto |
|---------|---------|---------|
| Remover extractTextFromPdfBase64 | ai-chat | Remove texto garbled |
| Informar IA sobre PDF sem tentar ler | ai-chat | IA confirma recebimento |
| Nao baixar base64 de PDFs | evolution-webhook | Evita download inutl |

## Resultado Esperado

- Cliente envia PDF -> IA responde "Recebi o documento 122.pdf, vou encaminhar para analise"
- IA NAO fica silenciosa
- Imagens continuam funcionando com multimodal (image_url)
- Fluxo de atendimento continua normalmente
