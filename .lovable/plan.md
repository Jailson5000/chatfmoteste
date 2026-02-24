

# Auditoria Completa: Fluxo de IA e Migração Evolution -> Uazapi

## Problemas Encontrados

### 1. Duplicação de Mensagens da IA — SEM PROBLEMA
O webhook uazapi recebe eventos duplicados (o log mostra o erro `23505 duplicate key`), mas isso é tratado corretamente: a segunda tentativa falha no insert e o processamento de IA roda apenas na primeira. Sem duplicação real.

### 2. Ferramentas de Agendamento (Scheduling Tools) — OK
O `ai-chat` verifica `scheduling_enabled` na automação e `agenda_pro_settings.is_enabled` do tenant. Se ambos estão ativos, injeta as `SCHEDULING_TOOLS` (listar serviços, verificar disponibilidade, criar/reagendar/cancelar agendamentos). Isso é agnóstico de provedor — funciona igual para Evolution e uazapi.

### 3. Resposta da IA sem Split Multi-parte — PROBLEMA MENOR
O `evolution-webhook` usa `sendAIResponseToWhatsApp()` que divide respostas longas em partes (max 5), adiciona delays humanos entre elas, e suporta áudio TTS. O `uazapi-webhook` envia a resposta inteira como uma única mensagem. Para respostas curtas funciona, mas respostas longas chegam como um "textão".

### 4. `process-follow-ups` — PROBLEMA CRÍTICO
Usa formato Evolution API hardcoded:
```
endpoint: /message/sendText/{instanceName}
header: apikey: {key}
```
Para instâncias uazapi, deveria usar:
```
endpoint: /send/text
header: token: {key}
```
Resultado: **follow-ups vão falhar** em instâncias uazapi.

### 5. `process-scheduled-messages` — PROBLEMA CRÍTICO
Usa `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` como variáveis de ambiente globais para enviar mensagens agendadas customizadas (não via `agenda-pro-notification`). Para uazapi, precisa buscar `api_url`/`api_key` da instância e usar o formato correto.

### 6. `agenda-pro-notification` — PROBLEMA CRÍTICO
Envia notificações WhatsApp (confirmações, lembretes, notificação ao profissional) usando o formato Evolution:
```typescript
fetch(`${apiUrl}/message/sendText/${instance.instance_name}`, {
  headers: { apikey: instance.api_key }
})
```
Para uazapi, precisa usar:
```typescript
fetch(`${apiUrl}/send/text`, {
  headers: { token: instance.api_key }
})
```

### 7. `uazapi-webhook` AI trigger — OK (já corrigido)
O bloco de trigger da IA já envia `message`, `automationId`, `context` corretos e salva a resposta. Funcional.

## Solução

Adaptar as 4 funções que ainda usam formato Evolution hardcoded para detectar o provedor e rotear corretamente. A detecção é simples: instâncias uazapi têm `api_provider = 'uazapi'` ou `api_url` contendo `uazapi.com`.

### Arquivo 1: `supabase/functions/process-follow-ups/index.ts`

**Mudança**: No bloco de envio (linhas 264-326), detectar o provedor pela `api_url` da instância e ajustar endpoint + headers:

- Se `apiUrl` contém `uazapi.com`: usar `/send/text` com header `token`
- Senão (Evolution): manter `/message/sendText/{instanceName}` com header `apikey`

Também para media: uazapi usa `/send/image`, `/send/audio`, `/send/video`, `/send/document`.

### Arquivo 2: `supabase/functions/process-scheduled-messages/index.ts`

**Mudança**: No bloco de envio de mensagens customizadas (linhas 167-226), buscar `api_url` e `api_key` da instância (já busca `instance_name`) e usar o mesmo padrão de detecção de provedor. Parar de depender de `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` globais.

### Arquivo 3: `supabase/functions/agenda-pro-notification/index.ts`

**Mudança**: Nos dois pontos de envio WhatsApp (linhas 385-398 e 669-682), detectar provedor pela `api_url` da instância:

- Se uazapi: `POST /send/text` com `{ number, text }` e header `token`
- Se Evolution: manter formato atual

### Arquivo 4: `supabase/functions/uazapi-webhook/index.ts`

**Mudança menor**: Adicionar split de mensagens longas no bloco de resposta da IA (linhas 978-1006). Dividir `aiText` em partes (max 5) com delay de 1-2s entre elas, replicando o comportamento do evolution-webhook.

## Resumo de Mudanças

| Arquivo | Problema | Prioridade |
|---|---|---|
| `process-follow-ups/index.ts` | Envia follow-ups com formato Evolution | CRÍTICO |
| `process-scheduled-messages/index.ts` | Usa env vars Evolution globais | CRÍTICO |
| `agenda-pro-notification/index.ts` | Notificações com formato Evolution | CRÍTICO |
| `uazapi-webhook/index.ts` | IA responde em bloco único | MENOR |

## Resultado Esperado

- Follow-ups serão enviados corretamente via uazapi
- Mensagens agendadas do Agenda Pro funcionarão com instâncias uazapi
- Notificações de agendamento (confirmação, lembrete) chegarão via WhatsApp
- Respostas longas da IA serão divididas em partes com delay natural

