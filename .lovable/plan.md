
## Objetivo
Restaurar o envio de áudio pela IA no WhatsApp (sem cair no aviso “⚠️ Não consegui enviar por áudio...”), voltando a priorizar o formato/rota que já era aceito (OGG/voz), mas mantendo a melhoria de “download do áudio” (que hoje está sendo salvo no storage como MP3).

---

## Diagnóstico (o que está acontecendo)
Pelo código atual, quando “modo áudio” está ativo e `audioRequested === true`, o sistema entra em **audio-only**:

- Gera TTS via `generateTTSAudio(...)` (hoje retorna **base64 de MP3**, `mimeType: audio/mpeg`).
- Envia para o WhatsApp com `sendAudioToWhatsApp(...)`.
- Se falhar (sem `messageId`), dispara fallback de texto + aviso:
  - `"⚠️ Não consegui enviar por áudio no momento, mas aí está a resposta em texto."`

O ponto sensível é exatamente o `sendAudioToWhatsApp`:
- Atualmente ele usa **somente** `POST /message/sendMedia/...` com:
  - `mediatype: "audio"`
  - `mimetype: "audio/mpeg"` (mudança recente)
  - **sem** `fileName`
- Em implementações/versões comuns da Evolution API, envio de “voz/PTT” costuma ser mais estável via:
  - `POST /message/sendWhatsAppAudio/...` (rota especializada) e/ou
  - `sendMedia` com `mimetype: audio/ogg;codecs=opus` + `fileName: audio.ogg`

O screenshot indica exatamente isso: o modo áudio está ligado, mas o WhatsApp não aceitou o envio e o sistema caiu no fallback.

---

## Correção proposta (robusta e alinhada ao que você pediu: voltar a OGG)
### Ideia central
Transformar `sendAudioToWhatsApp` em um **envio com fallback em camadas**, priorizando o caminho “voz/ogg” (o que você disse que sempre foi aceito), mas mantendo compatibilidade caso alguma instância aceite MP3:

**Ordem de tentativa (proposta):**
1) Tentar `sendWhatsAppAudio` (rota mais “voz/PTT”)
2) Se falhar: `sendMedia` com **OGG** (mimetype `audio/ogg;codecs=opus`, `fileName: audio.ogg`)
3) Se falhar: `sendMedia` com **MP3** (mimetype `audio/mpeg`, `fileName: audio.mp3`)

Além disso:
- Sempre “limpar” o base64 antes de enviar: `trim()` + remover whitespace/newlines
- Logar status e trecho do body de erro em cada tentativa (para sabermos exatamente o motivo quando falha)

### Por que isso resolve
- Você volta a priorizar OGG (e rota de voz) para o WhatsApp, que já era o comportamento aceito.
- Não depende de “mimetype perfeito” em um único endpoint.
- Se algum provedor/instância aceitar MP3 por `sendMedia`, ele ainda funcionará.
- O sistema deixa de cair no fallback de texto na maioria dos casos reais.

---

## Sobre “voltar a enviar em OGG” vs “salvar para download”
Hoje o download está sendo viabilizado salvando o áudio gerado no storage como:
- path: `${lawFirmId}/ai-audio/${whatsappMessageId}.mp3`
- `contentType: audio/mpeg`

Isso pode continuar exatamente assim (não quebra o download) porque:
- O problema atual é **envio ao WhatsApp**, não o arquivo salvo.
- Converter MP3→OGG exigiria transcodificação (não é trivial/leve no runtime atual).

Se você quiser que o download também seja OGG no futuro, a abordagem correta (mais segura) seria:
- Gerar TTS já em Opus/OGG (se o provedor suportar) OU
- Após enviar pro WhatsApp, buscar o áudio “real” do WhatsApp e salvar esse (mas isso é uma segunda etapa, não necessária para destravar o envio agora).

---

## Mudanças de código (arquivos)
### 1) `supabase/functions/evolution-webhook/index.ts`
Modificar **apenas** a função `sendAudioToWhatsApp(...)`:

**Ajustes planejados:**
- Implementar limpeza de base64
- Implementar tentativa 1: `/message/sendWhatsAppAudio/${instanceName}`
  - payload: `{ number: remoteJid, audio: cleanedBase64, delay: 1200 }`
- Se falhar:
  - tentativa 2: `/message/sendMedia/${instanceName}` com OGG
    - `{ number, mediatype:"audio", mimetype:"audio/ogg;codecs=opus", fileName:"audio.ogg", media: cleanedBase64, delay:1200 }`
- Se falhar:
  - tentativa 3: `sendMedia` com MP3
    - `{ ..., mimetype:"audio/mpeg", fileName:"audio.mp3" }`
- Em todas as falhas:
  - registrar `status`, `endpoint`, e `errorText.slice(0, 500)` no `logDebug('SEND_AUDIO', ...)`

**Importante:** não mexeremos no fluxo de salvar MP3 no storage agora (isso não é o causador do bug e preserva o download).

---

## Como vamos validar (checklist de teste)
1) Em uma conversa com “Áudio ativo”:
   - Enviar uma mensagem do cliente que dispare `audioRequested` (ex: “me manda em áudio”).
   - Verificar que:
     - Não aparece o aviso de fallback
     - O WhatsApp recebe uma mensagem de áudio
2) Verificar no painel:
   - A mensagem salva no histórico como `message_type='audio'`
   - O item de mídia pode ser baixado (link do `media_url`)
3) Teste de regressão:
   - Conversa sem áudio ativo continua enviando texto normalmente
   - Caso o envio de áudio falhe mesmo nas 3 tentativas, o fallback continua funcionando (melhor do que travar)

---

## Riscos e mitigação
- **Risco:** algumas instâncias podem falhar no `sendWhatsAppAudio` mas aceitar `sendMedia`.
  - **Mitigação:** fallback em camadas (2 e 3).
- **Risco:** diferença entre “formato enviado ao WhatsApp” e “arquivo baixado” (WhatsApp pode ficar como voz/ogg, download como mp3).
  - **Mitigação:** manter assim por agora para destravar envio; se você exigir “download em ogg”, fazemos uma segunda etapa (geração/armazenamento em ogg).
- **Risco de deploy intermitente (erro de import deno.land):**
  - **Mitigação:** se ocorrer, repetir deploy; é erro de rede do bundler. (Opcional futuro: migrar imports para outra fonte mais estável, mas isso foge do bug do áudio.)

---

## Resultado esperado
- IA volta a enviar áudio no WhatsApp de forma confiável (priorizando OGG/voz como antes).
- Fallback “não consegui enviar por áudio” deixa de ocorrer nesses cenários.
- Download do áudio continua disponível (via arquivo salvo no storage).
