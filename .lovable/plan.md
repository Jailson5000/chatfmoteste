

# Analise Completa do Sistema MiauChat — Admin + Cliente + UAZAPI

---

## 1. Estado da Implementacao UAZAPI

### Funcionalidades OK

| Funcionalidade | Status |
|---|---|
| Recebimento de mensagens (webhook) | OK |
| Resolucao de conversa (5 etapas: JID exato → telefone+instancia → orfao JID → orfao telefone → criar nova) | OK |
| Resolucao de LID (@lid → JID real via wa_chatid, wa_fastid, phone, participant) | OK |
| Deteccao de tipo de mensagem (PascalCase + generic "media" + inferencia por MIME) | OK |
| Persistencia de midia (base64 → Storage, /message/download → Storage) | OK |
| Deduplicacao por whatsapp_message_id | OK |
| Auto-desarquivamento com restauracao de handler | OK |
| Criacao automatica de cliente + avatar (imagePreview + /profile/image) | OK |
| Transcricao de audio (Whisper via transcribe-audio) | OK — implementado recentemente |
| Respostas em audio TTS (ai-text-to-speech → /send/audio PTT) | OK — implementado recentemente |
| Fragmentacao de respostas IA (responseParts + fallback 400 chars, delays 1-3s) | OK |
| Envio de templates com midia (campo `type` no payload) | OK — corrigido recentemente |
| Contagem de uso IA (ai_conversation deduplicado por periodo) | OK |
| Contagem de uso TTS (usage_records com duration_seconds estimado) | OK |
| skipUsageTracking em previews de voz | OK — corrigido recentemente |
| Provider Pattern via whatsapp-provider.ts (sendText, sendMedia, sendAudio) | OK |
| Conexao simplificada (init → connect via evolution-api edge function) | OK |
| Auto-deteccao de telefone (chat.owner, /instance/status) | OK |
| Protecao anti-loop (wasSentByApi) | OK |
| Bloqueio de mensagens de grupo | OK |

### Problemas Encontrados

#### Problema 1: TODAS as empresas com `provisioning_status = partial` e `health_status = degraded`

**Causa**: O `n8n_workflow_status` de 8/9 empresas mostra `error` com `n8n_last_error: {"error":"Unauthorized","success":false}`. Isso significa que o token N8N esta expirado ou incorreto.

**Impacto**: Cosmético no painel admin — as empresas aparecem como "degradadas" quando na verdade estao funcionais (a FMO tem 682 conversas ativas, 10.906 mensagens no mes). O sistema funciona sem N8N para a maioria dos casos.

**Correcao necessaria**: Nao e um bug de codigo — precisa atualizar as credenciais N8N no `system_settings` ou, se N8N nao esta sendo usado, criar uma opcao para marcar empresas como "N8N nao aplicavel" para que o health check nao as marque como degradadas.

**Proposta de correcao no codigo**: Ajustar o `tenant-health-check` para considerar `n8n_workflow_status = null` (sem workflow configurado) como aceitavel, nao degradado. Se a empresa nao tem `n8n_workflow_id`, o status do workflow nao deve impactar o health.

#### Problema 2: `client_app_status` inconsistente

Os status variam entre `healthy`, `active`, `created`, `pending` — sem uma transicao clara. Empresas que funcionam perfeitamente (FMO) mostram `client_app_status: healthy` mas `provisioning_status: partial` por causa do N8N.

---

## 2. Estado do Sistema Admin Global

### Funcionalidades OK
- CRUD de empresas com provisionamento completo
- Aprovacao/rejeicao de empresas
- Suspensao/liberacao de empresas
- Gestao de planos e limites customizados
- Monitoramento de consumo (conversas IA + minutos TTS)
- Gestao de conexoes WhatsApp (recentemente atualizada para mostrar provedor)
- Reenvio de acesso inicial
- Solicitacoes de adicionais (addon requests)
- Auditoria de logs
- Gestao de templates de IA

### Dados Reais (Fev/2026)
- 9 empresas cadastradas (todas ativas)
- 543 conversas de IA registradas
- 72 audios TTS gerados (27.2 minutos)
- Database: 1.2 GB

---

## 3. Estado do Sistema Cliente

### Funcionalidades OK
- Conversas com Realtime + polling fallback
- Kanban com 4 modos de agrupamento (departamento, status, responsavel, conexao)
- Tarefas com Kanban + calendario + lista
- Agenda Pro com agendamentos, profissionais, servicos
- Configuracoes completas (voz IA, automacoes, horario comercial, integracoes)
- Gestao de contatos com importacao/exportacao
- Base de conhecimento para IA
- Dashboard com metricas

---

## 4. Capacidade: Quantas Empresas Suportamos (Modelo FMO)

### Perfil FMO (empresa de referencia)

| Metrica | Valor |
|---|---|
| Usuarios | 4 |
| Agentes IA | 4 |
| Instancias WhatsApp | 5 (1 uazapi, 4 evolution) |
| Clientes | 685 |
| Conversas totais | 682 |
| Conversas ativas (30d) | 619 |
| Mensagens (30d) | 10.906 |
| Mensagens IA (30d) | 4.801 |
| Plano | ENTERPRISE (R$ 1.297/mes) |

### Calculo de Capacidade

**Database (1.2 GB atualmente com 9 empresas)**
- Lovable Cloud (Supabase): limite padrao de 8 GB no plano Pro
- FMO usa ~600 MB (inclui mensagens, midias, logs)
- Uma empresa media (BASIC/STARTER) usa ~100-200 MB
- **Capacidade estimada: 30-40 empresas** no plano atual do database

**Edge Functions (Supabase)**
- Invocacoes: limite de 500K/mes no Pro
- FMO gera ~11K mensagens/mes → ~22K invocacoes (webhook + AI + TTS)
- **Capacidade estimada: ~20 empresas no perfil FMO**, ou ~50 empresas menores (BASIC)

**Storage (chat-media bucket)**
- Limite: 100 GB no Pro
- Audio + imagens + documentos crescem ~2-5 GB/mes com 20 empresas ativas
- **Capacidade: 1-2 anos** antes de necessitar upgrade

**Realtime**
- Cada empresa com usuarios ativos abre 3-4 canais Realtime
- Limite: 200 conexoes simultaneas no Pro
- **Capacidade: ~50 empresas** com 1-2 usuarios simultaneos cada

### Resumo de Capacidade

```text
+---------------------+----------+-----------+
| Recurso             | Gargalo  | Empresas  |
+---------------------+----------+-----------+
| Database (8 GB)     | Medio    | ~30-40    |
| Edge Functions      | Primário | ~20 (FMO) |
|                     |          | ~50 (BASIC)|
| Storage (100 GB)    | Baixo    | ~50+      |
| Realtime (200 conn) | Medio    | ~50       |
+---------------------+----------+-----------+
| LIMITE PRÁTICO      |          | 20-30     |
+---------------------+----------+-----------+
```

**Para escalar alem de 30 empresas**: Upgrade do plano Supabase (Pro → Team), otimizacao de snapshots antigos, e politica de retencao de mensagens (arquivar mensagens > 6 meses).

---

## 5. Correcao Proposta: Health Check Tolerante ao N8N

**Arquivo: `supabase/functions/tenant-health-check/index.ts`**

Ajustar a logica para que empresas SEM workflow N8N configurado (`n8n_workflow_id IS NULL`) nao sejam marcadas como "degraded". O health check deve considerar apenas:
- `client_app_status` (conexao, usuarios, agentes)
- WhatsApp instances status
- N8N status **somente se n8n_workflow_id existir**

Se `n8n_workflow_id` e null e `n8n_workflow_status` e `error` (tentativa falhada que nunca foi resolvida), o health check deve tratar como "warning" nao "degraded".

Isso corrigira o problema cosmético de todas as 9 empresas aparecerem como "degraded" no painel admin.

---

## Resumo Final

| Area | Estado | Acao |
|---|---|---|
| UAZAPI: mensagens, midia, IA, audio, TTS | OK | Nenhuma |
| UAZAPI: templates com midia | OK | Corrigido recentemente |
| UAZAPI: transcricao de audio | OK | Implementado recentemente |
| Admin Global | OK | Nenhuma |
| Cliente (conversas, kanban, tarefas) | OK | Nenhuma |
| Health check mostra tudo "degraded" | BUG COSMÉTICO | Corrigir tenant-health-check |
| Capacidade do sistema | 20-30 empresas | Monitorar, planejar upgrade |
| Credenciais N8N | Expiradas/incorretas | Atualizar ou desabilitar N8N |

