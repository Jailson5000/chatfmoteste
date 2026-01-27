
Objetivo
- Fazer o envio de áudio para WhatsApp realmente chegar ao destinatário (não apenas “PENDING”).
- Garantir que Chat Web/Widget não permita áudio (somente texto e imagens), sem regressões nas demais mídias.

O que os logs mostram (e por que o áudio não chega)
1) A função de backend “evolution-api” está tentando enviar áudio via endpoint dedicado:
   - POST /message/sendWhatsAppAudio/{instance}
2) Essa tentativa está falhando com HTTP 400:
   - “Owned media must be a url, base64, or valid file with buffer”
3) Em seguida, o código faz fallback para:
   - POST /message/sendMedia/{instance} (mediatype: "audio")
   - Esse fallback retorna HTTP 201, gera whatsapp_message_id e a UI marca como “sent”, mas:
     - Nenhum ACK (messages.update) chega para esses áudios
     - delivered_at/read_at permanecem nulos no banco
     - Resultado prático: o destinatário não recebe o áudio

Causa raiz (confirmada por documentação)
- O endpoint sendWhatsAppAudio aceita o campo “audio” como “url or base64”.
- Hoje estamos enviando “audio” como Data URI (data:audio/...;base64,XXXX).
- A Evolution API (neste endpoint) NÃO aceita Data URI; ela espera base64 “puro” (sem “data:...base64,”) ou uma URL.
- Portanto, o envio “correto” (PTT/voice note) está falhando sempre e caindo no fallback que não entrega.

Sobre a hipótese “áudio descriptografado”
- Não é o problema aqui: a criptografia/descriptografia (.enc) ocorre no fluxo de download/mídia do WhatsApp (mmg.whatsapp.net).
- Para envio, o provedor recebe o arquivo “normal” (base64) e ele mesmo faz o pipeline WhatsApp (incluindo criptografia). O ponto quebrado é o formato do payload no sendWhatsAppAudio (Data URI vs base64 puro).

Plano de correção (mudanças mínimas, sem regressões)
1) Corrigir o envio de áudio no backend (supabase/functions/evolution-api/index.ts)
   1.1) Ajustar a chamada ao endpoint sendWhatsAppAudio para enviar:
       - audio: "<base64 puro>" (sem prefixo data:)
       - manter number: "<digits>"
       - manter delay (opcional)
   1.2) Remover a lógica de “audioDataUri” do sendWhatsAppAudio (ou deixar apenas como fallback de compatibilidade, mas NÃO como payload principal).
   1.3) Garantir que o base64 esteja “limpo”:
       - trim e remoção de quebras de linha (alguns encoders inserem \n)
   1.4) Logging “diagnóstico” (sem dados sensíveis):
       - endpoint usado, status HTTP, tamanho base64 (len/KB estimado), instance_name, messageId retornado.
   1.5) Manter fallback para sendMedia apenas se sendWhatsAppAudio falhar, mas com transparência:
       - Retornar no response um campo como methodUsed: "sendWhatsAppAudio" | "sendMedia"
       - Assim o frontend pode mostrar “Enviado (fallback)” quando necessário (evita falsa sensação de sucesso total).

2) Alinhar o formato “audio.webm” (pedido do usuário) sem quebrar compatibilidade
   - No frontend já estamos gerando fileName .webm quando o Blob é webm.
   - No backend, sendWhatsAppAudio não recebe fileName/mimetype na spec, mas deve aceitar base64 do arquivo e detectar o tipo.
   - Para minimizar risco:
     - Se mimeType indicar webm, manter o base64 como está (não tentar “forçar” audio/ogg).
     - O fallback sendMedia continuará enviando com mimetype e fileName coerentes (audio/webm + *.webm).

3) Garantir bloqueio total de áudio para Chat Web/Widget (sem depender só do origin)
   Problema potencial: alguns registros podem vir com origin nulo/inconsistente, permitindo que o botão apareça.
   3.1) Frontend (src/pages/Conversations.tsx + onde o AudioRecorder é renderizado):
       - Definir “isWhatsAppConversation” com critérios mais robustos:
         - origin === 'whatsapp' (case-insensitive) OU
         - remote_jid termina com '@s.whatsapp.net' OU
         - whatsapp_instance_id não nulo
       - Mostrar o AudioRecorder somente quando isWhatsAppConversation === true.
       - Manter a validação “fail-fast” no handler (mesmo se UI esconder, ainda bloqueia caso chegue).
   3.2) (Opcional) Repetir o mesmo critério no KanbanChatPanel (se existir gravação lá), para evitar regressões.

4) Validação controlada (roteiro rápido e objetivo)
   4.1) Enviar um áudio curto (2–5s) para um número externo (já confirmado).
   4.2) Conferir logs do backend “evolution-api”:
       - Não pode mais aparecer o erro 400 “Owned media…”
       - methodUsed deve ser “sendWhatsAppAudio”
       - status HTTP deve ser 200/201 e retornar messageId
   4.3) Conferir no WhatsApp do destinatário: áudio chegou e toca.
   4.4) Conferir “messages.update” no webhook e/ou coluna delivered_at:
       - Se o áudio chegar, normalmente veremos delivered_at preencher depois.
       - Mesmo que o ACK demore, o critério principal é “chegou no WhatsApp”.

Risco e mitigação (prioridade: zero regressão)
- Alterações isoladas ao branch mediaType === "audio" na função evolution-api; imagem/documento/vídeo ficam intactos.
- UI: apenas esconder/impedir AudioRecorder em canais não-WhatsApp, sem alterar envio de texto/imagens do Widget.
- Fallback preservado para resiliência, mas com indicação do método usado.

Entregáveis (o que será alterado quando você aprovar)
- supabase/functions/evolution-api/index.ts
  - sendWhatsAppAudio: enviar base64 puro em “audio”
  - logs melhores + retorno com methodUsed
- src/pages/Conversations.tsx
  - esconder AudioRecorder fora do WhatsApp com detecção robusta (não só origin)
  - manter bloqueio fail-fast ao tentar enviar
- (Se aplicável) src/components/kanban/KanbanChatPanel.tsx
  - mesma regra de bloqueio/ocultação do gravador

Critério de sucesso
- Áudio enviado pela interface chega no WhatsApp do cliente (número externo) consistentemente.
- No Chat Web/Widget não é possível gravar/enviar áudio (somente texto e imagens).
