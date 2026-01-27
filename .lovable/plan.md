
Objetivo (urgente)
- Fazer o áudio enviado pelo sistema chegar de fato no WhatsApp do cliente.
- Manter separação total: Chat Web (texto apenas) não interfere em WhatsApp (texto + mídia).
- Reduzir retrabalho adicionando diagnósticos e validação “fail-fast” (se falhar, falha claramente e com logs úteis).

O que já sabemos (a partir do que foi observado no código/logs)
- O frontend envia o áudio para a função “evolution-api” com:
  - mediaBase64 (sem prefixo data:)
  - fileName (hoje fixo como .webm, mesmo quando o Blob pode ser ogg)
  - mimeType (audioBlob.type; frequentemente “audio/ogg;codecs=opus”)
- A função “evolution-api” atualmente envia áudio via endpoint `/message/sendMedia/{instance}` com `mediatype:"audio"`, `mimetype:"audio/ogg;codecs=opus"`, `fileName` e `media` (base64).
- Logs mostram “Media sent successfully” e o webhook registra evento `send.message` com `status:"PENDING"` para áudio.
- No banco, mensagens de áudio ficam sem `delivered_at`/`read_at` (diferente de textos), sinalizando que não estamos recebendo confirmação/ACK de entrega para áudio — e isso bate com “cliente não recebe”.

Hipótese principal (mais provável)
- O envio via `sendMedia` para áudio está aceitando o payload (retorna PENDING e um audioMessage url), mas não está realmente entregando no WhatsApp do destinatário por incompatibilidade do formato/payload esperado para áudio (voice note) pelo provedor.
- A documentação do provedor possui endpoint específico para áudio: `/message/sendWhatsAppAudio/{instance}` com campo `audio` (geralmente aceitando URL ou data URI/base64). Esse endpoint tende a setar `ptt: true` e ter pipeline de áudio mais confiável que o sendMedia genérico.

Estratégia de correção (sem mexer no Chat Web)
1) Frontend (Conversations.tsx) – normalização do nome/extension do arquivo
   - Manter Chat Web = texto apenas (já está).
   - Para WhatsApp:
     - Gerar fileName coerente com o tipo real do Blob:
       - Se Blob inclui “ogg” -> `.ogg`
       - Se inclui “mp4” -> `.m4a`
       - Se inclui “webm” -> `.webm`
     - Enviar sempre fileName “com extensão correta” (isso ajuda o backend e evita pipeline errada).
     - Enviar mimeType “limpo” quando necessário:
       - Normalizar `"audio/ogg;codecs=opus"` para `"audio/ogg"` quando a API exigir formato sem parâmetros (manteremos também o original para logs; mas payload vai com o que for mais compatível).

2) Backend function (supabase/functions/evolution-api/index.ts) – trocar a estratégia de envio de áudio
   - Implementar envio prioritário por `/message/sendWhatsAppAudio/{instance}` quando `mediaType === "audio"`.
   - Como montar o campo `audio`:
     - Se vier base64 “puro” do frontend, converter para data URI:
       - `audio: "data:<mime>;base64,<base64>"`
     - Onde `<mime>` será preferencialmente:
       - `"audio/ogg"` (ou `"audio/ogg;codecs=opus"` se a API aceitar; mas começaremos com `"audio/ogg"` por compatibilidade)
   - Manter fallback seguro:
     - Se `sendWhatsAppAudio` retornar erro HTTP, fazer fallback para `sendMedia` (como está hoje) e logar claramente que caiu no fallback.
   - “Fail-fast” e validações:
     - Se base64 muito pequeno (ex.: < 1KB) ou vazio: rejeitar antes de chamar o provedor (evita “PENDING” com áudio inválido).
     - Logar (mas mascarando PII): instance_name, instance_id, targetNumber mascarado, endpoint usado, mime final, tamanho do base64 e tamanho em bytes estimado.
   - (Opcional, mas recomendado) Verificação de status da instância antes de enviar:
     - Fazer um GET rápido em `/instance/connectionState/{instance}` e, se não estiver “connected”, retornar erro claro (“instância desconectada”) em vez de tentar enviar e ficar PENDING para sempre.

3) Webhook (supabase/functions/evolution-webhook/index.ts) – rastrear entrega de áudio “fromMe”
   - Ajustar o handler de `messages.update` para também processar atualizações “fromMe: true” e setar:
     - `delivered_at` quando status indicar entregue/servidor ack (ex.: DELIVERY_ACK / SERVER_ACK / DELIVERED)
     - `read_at` quando status for READ
   - Isso não “garante” que o cliente recebeu, mas nos dá telemetria objetiva:
     - Se áudio ficar sempre sem delivered_at, sabemos que o problema é entrega/ACK no provedor, não UI.

4) Teste controlado (roteiro de validação)
   - Passo A: enviar áudio curto (2–5s) para um número real fora do próprio aparelho.
   - Passo B: checar logs da função evolution-api:
     - Confirmar que tentou `sendWhatsAppAudio` (sem cair no fallback).
     - Confirmar status HTTP 200/201.
   - Passo C: checar logs do webhook:
     - Confirmar eventos `send.message` e depois `messages.update` para a mesma conversa/instância.
   - Passo D: checar no app:
     - A mensagem deve aparecer.
     - Em poucos segundos/minutos, `delivered_at` deve preencher (se o provedor emitir).
   - Critério final: o áudio precisa aparecer e tocar no WhatsApp do cliente.

Riscos e mitigação (para evitar regressões)
- Risco: alterar rota de envio de áudio pode afetar imagens/documentos.
  - Mitigação: mudanças ficam restritas ao branch `mediaType === "audio"`; demais tipos permanecem intactos.
- Risco: divergência de mime/extension.
  - Mitigação: logs + fallback para `sendMedia` se `sendWhatsAppAudio` falhar.
- Risco: “PENDING” continuar.
  - Mitigação: instrumentação no webhook e checagem de conexão da instância para separar “instância off” vs “pipeline de áudio”.

Entregáveis (o que será alterado quando você aprovar)
- src/pages/Conversations.tsx
  - fileName de áudio baseado no tipo real do Blob (ogg/webm/m4a)
  - mimeType normalizado (quando aplicável)
  - manter bloqueio de áudio para Chat Web (texto only)
- supabase/functions/evolution-api/index.ts
  - áudio enviado preferencialmente via `/message/sendWhatsAppAudio/{instance}`
  - fallback para `/message/sendMedia/{instance}`
  - validações e logs úteis
  - (opcional) verificação de instância conectada antes do envio
- supabase/functions/evolution-webhook/index.ts
  - atualizar delivered_at/read_at também para mensagens “fromMe” em eventos `messages.update` (incluindo áudio)

Como isso atende seu pedido
- “Ainda não envio áudios para WhatsApp”: troca para endpoint específico de áudio + data URI + validação deve destravar entrega real.
- “Separar Chat Web do WhatsApp”: Chat Web permanece texto-only e o áudio só roda na rota WhatsApp.
- “Sem retrabalho”: instrumentação e rastreio de entrega/ACK deixa claro onde falha, sem tentativas cegas.

Próximo passo
- Aprovar este plano para eu implementar as mudanças em modo edição e já deixar um roteiro de teste rápido para você validar em produção/teste.