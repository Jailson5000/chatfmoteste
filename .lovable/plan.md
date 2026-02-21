

## Diagnóstico: IA não reconhece imagens recebidas

### O que já existe

O sistema **já possui** toda a infraestrutura para reconhecimento de imagens:

1. `evolution-webhook` detecta `imageMessage` e salva o `mimeType` + `whatsappMessageKey`
2. O processador da fila de debounce faz download do base64 da imagem via Evolution API
3. `ai-chat` monta mensagem multimodal com `image_url` para o modelo Gemini (que suporta visão)
4. Existe fallback: se multimodal falha (erro 400), a IA recebe apenas texto

### Causa raiz identificada

O problema está na **linha 1482** do `evolution-webhook`:

```text
const primaryType = messages.some(m => m.type === 'text') ? 'text' : messages[0]?.type || 'text';
```

Quando o cliente envia uma imagem (mesmo sozinha, sem texto), a fila de debounce agrupa mensagens por 10 segundos. Se qualquer mensagem de texto existir (inclusive uma anterior no mesmo lote), `primaryType` vira `'text'`. Isso causa uma cascata:

- `primaryType = 'text'` e passado como `messageType` para o contexto
- Na condição de download (linha 1503), `documentMimeType` pode estar correto, mas...
- Quando `metadata.document_mime_type` se perde na sobrescrita de debounce (texto substitui imagem), o download **nunca acontece**
- A IA recebe `[Cliente enviou uma imagem]` como texto puro, sem ver o conteudo

Alem disso, ha um segundo problema: quando o download do base64 **falha** (timeout de 15s, Evolution offline, imagem muito grande), o erro e silencioso e a IA processa sem a imagem, respondendo "Nao consigo identificar imagens".

### Solucao

Tres correcoes no `evolution-webhook` (processador da fila):

1. **Priorizar tipo 'image'**: Inverter a logica de `primaryType` para priorizar midias sobre texto, permitindo que o download de imagem aconteca
2. **Recuperar metadata de imagem de mensagens individuais**: Ja existe fallback parcial (linha 1492-1501), mas precisa cobrir o cenario onde `primaryType` sobrescreve o tipo
3. **Log mais claro quando download falha**: Adicionar log explicito quando a imagem nao e baixada para facilitar debug futuro

E uma correcao no `ai-chat`:

4. **Melhorar mensagem quando imagem nao esta disponivel**: Em vez de enviar `[Cliente enviou uma imagem]` sem contexto, informar a IA que ela **deveria** ter visto a imagem mas houve um erro tecnico, e pedir para solicitar que o cliente reenvie

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/evolution-webhook/index.ts` | Corrigir logica de `primaryType` para priorizar imagem; melhorar logs |
| `supabase/functions/ai-chat/index.ts` | Melhorar tratamento quando imagem nao esta disponivel (fallback mais inteligente) |

### Impacto

- Sem alteracao em banco de dados ou RLS
- Sem risco de quebrar fluxo de texto existente
- A IA passa a receber imagens reais quando o download funciona
- Quando o download falha, a IA pede ao cliente para reenviar (em vez de dizer "nao consigo")
- O modelo `google/gemini-2.5-flash` usado ja suporta visao/multimodal nativamente

