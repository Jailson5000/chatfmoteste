
# Corrigir exibição de Story Mentions do Instagram

## Problema

Quando alguém menciona sua página em um Story do Instagram, o webhook recebe a mensagem com `attachments[0].type = "story_mention"` e uma URL da imagem/vídeo do story. O código atual só trata os tipos `image`, `video`, `audio` e `file` -- o tipo `story_mention` não é reconhecido, então o conteúdo fica como `[text]` (vazio com tipo "text").

Payload recebido (confirmado nos logs):
```text
attachments: [{
  type: "story_mention",
  payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/..." }
}]
```

## Correção

### Arquivo: `supabase/functions/meta-webhook/index.ts`

Adicionar tratamento para dois tipos de interação com Stories do Instagram no bloco de attachments (linhas 322-339):

1. **`story_mention`** -- quando alguém menciona a página em um story
2. **`story_reply`** -- quando alguém responde ao story da página (caso futuro, tratamento preventivo)

Código atual (linhas 322-339):
```text
if (message.attachments?.length > 0) {
  const att = message.attachments[0];
  mediaUrl = att.payload?.url || null;
  if (att.type === "image") { ... }
  else if (att.type === "video") { ... }
  else if (att.type === "audio") { ... }
  else if (att.type === "file") { ... }
  if (!content) content = `[${messageType}]`;
}
```

Adicionar após o `else if (att.type === "file")`:

```text
} else if (att.type === "story_mention") {
  messageType = "image"; // story has a visual (image or video)
  mediaMimeType = "image/jpeg";
  if (!content) content = "📢 Mencionou você em um story";
} else if (att.type === "story_reply") {
  messageType = "image";
  mediaMimeType = "image/jpeg";
  if (!content) content = "💬 Respondeu ao seu story";
}
```

Tambem tratar o campo `message.reply_to?.story` que pode vir em respostas a stories:

```text
// After attachments block, check for story reply metadata
if (message.reply_to?.story) {
  const storyUrl = message.reply_to.story.url;
  if (storyUrl && !mediaUrl) {
    mediaUrl = storyUrl;
    mediaMimeType = mediaMimeType || "image/jpeg";
  }
  if (!content || content === "[text]") {
    content = message.text || "💬 Respondeu ao seu story";
  }
}
```

O `mediaUrl` sera armazenado e a imagem/video do story sera baixada e salva no storage (o fluxo existente de download de midia ja faz isso).

## Nota sobre o App em Análise

Como o app da Meta ainda está em análise ("Advanced Access" pendente), a URL do story CDN pode expirar rapidamente ou ter restrições de acesso. A correção garante que:
- O conteúdo textual sempre exiba algo legível ("Mencionou você em um story")
- A mídia seja tentada para download, mas se falhar, o texto descritivo permanece

## Resumo

| Mudança | Arquivo | Risco |
|---------|---------|-------|
| Tratar `story_mention` no bloco de attachments | meta-webhook | Zero -- apenas adiciona novo tipo |
| Tratar `story_reply` no bloco de attachments | meta-webhook | Zero -- preventivo |
| Tratar `reply_to.story` metadata | meta-webhook | Zero -- fallback seguro |

## Resultado Esperado

- Story mentions aparecem como mensagem com texto "Mencionou você em um story" + imagem do story
- Story replies aparecem com o texto da resposta + referência ao story
- Nenhuma mensagem aparece mais como `[text]` genérico
