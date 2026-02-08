
## Diagnóstico (por que ainda não “baixa em .ogg”)
Pelo que vi no código e nos dados do banco, hoje existem **dois problemas diferentes** que se somam:

### 1) O arquivo “.ogg” salvo no storage não é realmente OGG
- O fluxo do áudio da IA gera TTS via **`ai-text-to-speech`**, e essa função **sempre retorna MP3**:
  - ElevenLabs: `output_format=mp3_44100_128`
  - OpenAI: `response_format: 'mp3'`
- Depois, no `evolution-webhook`, nós passamos a salvar isso como:
  - path `.../ai-audio/<id>.ogg`
  - `contentType: 'audio/ogg'`
  - `media_mime_type: 'audio/ogg'`
- Resultado: o storage contém **bytes de MP3 “fantasiados” de OGG**. Isso pode:
  - gerar download com “formato estranho”
  - gerar arquivo que não abre corretamente como OGG em alguns ambientes

Arquivos envolvidos:
- `supabase/functions/ai-text-to-speech/index.ts` (gera MP3 hoje)
- `supabase/functions/evolution-webhook/index.ts` (salva como .ogg)

### 2) O download via menu “Baixar” usa o texto da mensagem como nome do arquivo (sem extensão)
No frontend, o menu “Baixar” no bubble chama:
- `onDownloadMedia(whatsappMessageId, conversationId, content || undefined)`

Ou seja: para áudios (cliente e IA), ele está passando o **conteúdo transcrito/texto** como `fileName`.
A função que baixa (`handleDownloadMedia` em `Conversations.tsx` e no Kanban) faz:
- `link.download = fileName || download_<id>`
Se `fileName` for aquele texto longo, o download sai como um arquivo genérico, **sem .ogg**, exatamente como no seu print.

Arquivos envolvidos:
- `src/components/conversations/MessageBubble.tsx` (passa `content` como `fileName`)
- `src/pages/Conversations.tsx` (handleDownloadMedia)
- `src/components/kanban/KanbanChatPanel.tsx` (handleDownloadMedia)

---

## Objetivo da correção (sem quebrar nada)
1) Garantir que **o áudio gerado pela IA seja realmente OGG/Opus** (não MP3 renomeado).
2) Garantir que ao clicar em **“Baixar”** o arquivo seja salvo com **nome e extensão corretos** (ex: `audio_<id>.ogg`), independentemente do `content`.

---

## Mudanças propostas (mínimas e seguras)

### A) Backend: fazer o TTS gerar OGG/Opus de verdade
**Arquivo:** `supabase/functions/ai-text-to-speech/index.ts`

1) **ElevenLabs**
- Trocar:
  - `output_format=mp3_44100_128`
- Para algo do tipo:
  - `output_format=opus_48000` (ou o formato Opus suportado pela conta)
- E devolver no JSON:
  - `mimeType: "audio/ogg; codecs=opus"` (ou `"audio/ogg"`)

2) **OpenAI fallback**
- Trocar:
  - `response_format: 'mp3'`
- Para:
  - `response_format: 'opus'`
- E devolver:
  - `mimeType: "audio/ogg; codecs=opus"` (ou `"audio/ogg"`)

3) **Fallback de compatibilidade**
- Se por algum motivo o provider falhar com opus/ogg (ex: 422), fazer fallback interno:
  - tentar novamente em mp3
  - retornar `mimeType: "audio/mpeg"`
Isso mantém estabilidade e evita regressões.

Resultado esperado:
- `ai-text-to-speech` passa a retornar áudio em **OGG/Opus** na maioria dos casos, com fallback para MP3 apenas se necessário.

---

### B) Backend: salvar no storage com extensão e content-type coerentes com o TTS retornado
**Arquivo:** `supabase/functions/evolution-webhook/index.ts`

Hoje ele:
- chama `generateTTSAudio(...)` e recebe apenas `audioContent`
- e salva como `.ogg` sempre

Ajuste proposto:
1) Alterar `generateTTSAudio` para retornar um objeto:
```ts
{ audioContent: string; mimeType: string }
```
(pegando `mimeType` do `ai-text-to-speech`)

2) Na hora de salvar:
- se `mimeType` indicar ogg/opus:
  - path: `.ogg`
  - contentType: `audio/ogg`
  - `media_mime_type`: `audio/ogg` (ou `audio/ogg; codecs=opus`)
- se indicar mp3:
  - path: `.mp3`
  - contentType: `audio/mpeg`
  - `media_mime_type`: `audio/mpeg`

Isso remove o risco de “arquivo MP3 com cara de OGG”.

Observação importante:
- O envio ao WhatsApp continuará usando `sendAudioToWhatsApp` (que já tem fallback em camadas). Se passarmos também o `mimeType` para ela, dá para ajustar a 3ª tentativa (MP3) somente quando fizer sentido.

---

### C) Frontend: corrigir o nome/extensão do arquivo no “Baixar”
Aqui é onde seu print bate muito forte.

#### C1) Tornar `handleDownloadMedia` robusto (funciona mesmo que alguém passe fileName ruim)
**Arquivos:**
- `src/pages/Conversations.tsx`
- `src/components/kanban/KanbanChatPanel.tsx`

Alterar a lógica de filename para:
1) Pegar `mimetype` retornado do `get_media`
2) Derivar extensão:
   - `audio/ogg` → `.ogg`
   - `audio/mpeg` → `.mp3`
   - `application/pdf` → `.pdf`
   - etc.
3) Se `fileName`:
   - vier vazio, enorme, ou não tiver extensão, usar um padrão seguro:
     - `audio_<whatsappId8>.ogg` (para áudio)
     - `documento_<whatsappId8>.pdf` (para docs)
4) Sanitizar e limitar tamanho do nome (evita nome gigante quebrando o download no Windows/macOS).

Isso garante que:
- mesmo que o `MessageBubble` continue passando texto, **o download sai correto**.

#### C2) Parar de passar `content` como filename no menu
**Arquivo:** `src/components/conversations/MessageBubble.tsx`

Trocar os pontos onde está:
```ts
onDownloadMedia(whatsappMessageId, conversationId, content || undefined)
```
para passar:
- `undefined` (deixa `handleDownloadMedia` decidir), ou
- um nome gerado baseado em `message_type`/`mimeType`, ex:
  - `audio_<id8>.ogg`

Essa mudança evita que o texto da mensagem vire nome do arquivo.

---

## Plano de execução (ordem para minimizar risco)
1) **Frontend primeiro (baixo risco, resolve seu print imediatamente)**
   - Ajustar `handleDownloadMedia` (Conversations + Kanban)
   - Ajustar chamada no `MessageBubble` para não usar `content` como filename

2) **Backend TTS (garante OGG real e evita “formato fake”)**
   - Ajustar `ai-text-to-speech` para opus/ogg
   - Ajustar `evolution-webhook` para respeitar `mimeType` real ao salvar

3) Deploy e validação

---

## Checklist de testes (obrigatório para não causar regressão)
### Teste 1 — Download do áudio da IA
1) Em uma conversa com “Áudio ativo”, pedir: “me responde em áudio”
2) Na mensagem de áudio gerada:
   - Abrir menu da mensagem → **Baixar**
3) Verificar:
   - arquivo baixa com **extensão `.ogg`**
   - arquivo abre em player como **OGG/Opus** (não “arquivo genérico”)

### Teste 2 — Download do áudio do cliente (não pode quebrar)
- Repetir “Baixar” em um áudio do cliente
- Confirmar `.ogg` e abertura OK

### Teste 3 — Regressão em documentos/imagens
- Baixar um PDF/documento e uma imagem via “Baixar”
- Confirmar que nome/extensão continuam corretos

### Teste 4 — Playback dentro do chat
- Garantir que os players de áudio continuam reproduzindo normalmente

---

## Nota sobre histórico (áudios já existentes)
- A correção do frontend (nome/extensão) melhora inclusive downloads de mensagens antigas.
- Para os áudios da IA já salvos no storage durante o período “MP3 disfarçado de OGG”, eles podem continuar inconsistentes se alguém baixar diretamente pelo link do storage. Como mitigação:
  - o “Baixar” via menu (get_media) vai baixar o áudio real do WhatsApp (OGG/Opus), agora com nome correto.

---

## Arquivos que serão alterados
- `src/pages/Conversations.tsx` (handleDownloadMedia)
- `src/components/kanban/KanbanChatPanel.tsx` (handleDownloadMedia)
- `src/components/conversations/MessageBubble.tsx` (parar de passar `content` como filename)
- `supabase/functions/ai-text-to-speech/index.ts` (gerar OGG/Opus de verdade)
- `supabase/functions/evolution-webhook/index.ts` (salvar com mime/ext coerentes)

---

## Resultado esperado
- Download dos áudios da IA passa a sair com **`.ogg` de verdade** (e não arquivo sem extensão / formato errado).
- Mantém compatibilidade e reduz risco de quebra porque:
  - front fica robusto contra filename ruim
  - backend passa a produzir e armazenar OGG real, com fallback seguro para MP3 se necessário
