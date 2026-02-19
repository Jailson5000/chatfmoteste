
# Plano: Corrigir Marcacoes (Story Mentions) no Instagram

## Problema Identificado

A investigacao revelou a causa raiz exata: **o sistema salva videos de story como se fossem imagens**.

### Evidencia Concreta

Ao analisar os arquivos armazenados das marcacoes de hoje (19/02), o conteudo salvo como `.jpg` e na verdade um **video MP4** (formato `ftypisomisomiso2avc1mp41`). Isso acontece porque:

1. No `meta-webhook`, quando o tipo do attachment e `story_mention`, o codigo hardcoda:
   - `messageType = "image"`
   - `mediaMimeType = "image/jpeg"`
2. O arquivo e baixado e salvo com extensao `.jpg`
3. O frontend tenta renderizar como `<img>`, que falha porque o conteudo e um video
4. Resultado: "Imagem nao disponivel"

### Historico de marcacoes no banco

| Data | URL | Status |
|---|---|---|
| 19/02 (3 msgs) | Storage (supabase) | Salva, mas e VIDEO dentro de .jpg -- **quebrada** |
| 18/02 (1 msg) | lookaside.fbsbx.com | URL temporaria expirada -- **quebrada** |
| 17/02 (1 msg) | lookaside.fbsbx.com | URL temporaria expirada -- **quebrada** |

As mais antigas nao foram persistidas (bug anterior ja corrigido). As novas sao persistidas mas com mime type errado.

---

## Solucao

### Alteracao 1: Detectar o tipo real da midia no `meta-webhook`

Em vez de hardcodar `image/jpeg` para `story_mention` e `story_reply`, o sistema deve:

1. Fazer o download da midia
2. Inspecionar os primeiros bytes (magic bytes) para determinar se e imagem ou video
3. Usar o tipo correto para `messageType` e `mediaMimeType`

Deteccao por magic bytes:
- MP4/MOV: bytes iniciam com `ftyp` (posicao 4-7)
- JPEG: bytes iniciam com `FF D8 FF`
- PNG: bytes iniciam com `89 50 4E 47`

### Alteracao 2: Salvar com extensao correta

Se o conteudo for video, salvar como `.mp4` em vez de `.jpg`, e definir `messageType = "video"`.

### Alteracao 3: Tratar fallback quando deteccao falha

Se nao for possivel determinar o tipo, usar `messageType = "image"` como fallback (comportamento atual), mas logar um warning.

---

## Detalhes Tecnicos

### Arquivo: `supabase/functions/meta-webhook/index.ts`

**Parte 1 -- Nova funcao utilitaria** (adicionar perto do topo):

Criar funcao `detectMediaType(buffer: ArrayBuffer)` que inspeciona os magic bytes e retorna `{ messageType, mediaMimeType, ext }`.

**Parte 2 -- Refatorar o bloco de story_mention/story_reply** (linhas 340-348):

Em vez de definir mime type fixo, deixar como "pendente" e resolver apos o download:

```text
} else if (att.type === "story_mention" || att.type === "story_reply") {
  // Tipo sera detectado apos download (pode ser imagem ou video)
  messageType = "image"; // fallback
  mediaMimeType = null;  // sera detectado
  if (!content) {
    content = att.type === "story_mention" 
      ? "Mencionou voce em um story" 
      : "Respondeu ao seu story";
  }
}
```

**Parte 3 -- No bloco de persistencia de midia** (linhas 577-609):

Apos o download (`mediaRes.arrayBuffer()`), chamar `detectMediaType(mediaBuffer)` para determinar o tipo real. Se for video, atualizar `messageType` e `mediaMimeType` antes de salvar.

```text
// Apos: const mediaBuffer = await mediaRes.arrayBuffer();
// Detectar tipo real se nao definido ou se e story
if (!mediaMimeType || mediaMimeType === "image/jpeg") {
  const detected = detectMediaType(mediaBuffer);
  if (detected) {
    messageType = detected.messageType;
    mediaMimeType = detected.mediaMimeType;
  }
}
const ext = getExtFromMime(mediaMimeType || "image/jpeg");
```

### Nenhuma alteracao no frontend

O frontend ja suporta renderizacao de video (`isVideo` check na linha 1721 do `MessageBubble.tsx`). Se o `messageType` for `"video"` e o `media_mime_type` for `"video/mp4"`, o player de video sera renderizado automaticamente.

---

## Correcao dos dados antigos

Apos o deploy, executar uma query de correcao para as 5 mensagens ja salvas:

1. As 3 de hoje (storage com .jpg mas conteudo video): atualizar `message_type` para `"video"` e `media_mime_type` para `"video/mp4"` no banco. Os arquivos no storage continuarao funcionando pois o browser usa o content-type do header HTTP, nao a extensao.
2. As 2 mais antigas (URLs expiradas): nao tem como recuperar a midia -- essas ficarao sem imagem permanentemente.

---

## Resumo

| Item | Detalhe |
|---|---|
| Causa raiz | Story mentions podem ser video ou imagem, mas o codigo assumia sempre imagem |
| Arquivo alterado | `supabase/functions/meta-webhook/index.ts` |
| Tipo de mudanca | Adicionar deteccao de tipo por magic bytes |
| Risco | Muito baixo -- fallback mantem comportamento atual |
| Tempo estimado | ~30 minutos |
| Impacto | Marcacoes e respostas de story passam a exibir corretamente |
