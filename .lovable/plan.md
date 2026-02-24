

# Integrar uazapi como Provedor Alternativo de WhatsApp (Dual-Provider)

## Contexto

O sistema atualmente usa a Evolution API (auto-hospedada) para todas as operacoes de WhatsApp. A integracao envolve ~11.400 linhas de codigo backend (evolution-api: 5.102 linhas, evolution-webhook: 6.340 linhas). A uazapi e um servico SaaS gerenciado (R$138/mes - Servidor LITE, ate 100 dispositivos) que oferece proxy residencial, hospedagem inclusa e atualizacoes automaticas.

## Mapeamento de APIs: Evolution vs uazapi

| Funcionalidade | Evolution API | uazapi |
|---|---|---|
| Autenticacao | Header `apikey` | Header `token` |
| Base URL | `{api_url}/.../{instanceName}` | `https://{subdomain}.uazapi.com/...` |
| Conectar (QR) | `POST /instance/connect/{name}` | `POST /instance/connect` (body: phone opcional) |
| Status | `GET /instance/connectionState/{name}` | `GET /instance/status` |
| Enviar texto | `POST /message/sendText/{name}` | `POST /send/text` |
| Enviar midia | `POST /message/sendMedia/{name}` | `POST /send/media` |
| Webhook config | `POST /webhook/set/{name}` | `POST /webhook` |
| Deletar instancia | `DELETE /instance/delete/{name}` | `DELETE /instance` |
| Buscar contatos | `POST /chat/findContacts/{name}` | `GET /contacts` |
| Desconectar | `DELETE /instance/logout/{name}` | `POST /instance/disconnect` |

Diferencas-chave:
- Evolution: instance_name vai na URL como path param
- uazapi: cada instancia tem seu proprio subdominio + token. Nao tem path param de instancia
- Webhooks uazapi suportam filtro `excludeMessages: ["wasSentByApi"]` (anti-loop nativo)
- uazapi usa `number` no body (ex: "5511999999999"), Evolution usa `remoteJid` (ex: "5511999999999@s.whatsapp.net")

## Estrategia de Implementacao

A abordagem e criar uma **camada de abstracao (provider pattern)** que permite que cada instancia WhatsApp use Evolution OU uazapi, sem mudar o restante do sistema.

### Fase 1: Schema do Banco de Dados

Adicionar coluna `api_provider` na tabela `whatsapp_instances`:

```sql
ALTER TABLE public.whatsapp_instances 
ADD COLUMN api_provider text NOT NULL DEFAULT 'evolution' 
CHECK (api_provider IN ('evolution', 'uazapi'));
```

Para uazapi, os campos existentes serao reutilizados:
- `api_url` -> `https://{subdomain}.uazapi.com` (URL base da instancia uazapi)
- `api_key` -> token da instancia uazapi
- `instance_name` -> nome identificador (mesmo uso)

Atualizar a view `whatsapp_instances_safe` para incluir `api_provider`.

### Fase 2: Edge Function - Provider Abstraction Layer

Criar um modulo compartilhado `supabase/functions/_shared/whatsapp-provider.ts` que abstrai as chamadas:

```text
+-------------------+
| evolution-api     |  <-- Frontend chama normalmente
| (edge function)   |
+--------+----------+
         |
         v
+--------+----------+
| WhatsApp Provider |  <-- Nova camada de abstracao
| (shared module)   |
+--------+----------+
    |           |
    v           v
+-------+  +--------+
| Evol. |  | uazapi |
| API   |  | API    |
+-------+  +--------+
```

O modulo tera funcoes como:
- `sendText(provider, config, number, text)` 
- `sendMedia(provider, config, number, mediaType, ...)`
- `connectInstance(provider, config)`
- `getStatus(provider, config)`
- `configureWebhook(provider, config, webhookUrl)`
- `disconnectInstance(provider, config)`

### Fase 3: Adaptar evolution-api/index.ts

No `switch(body.action)`, antes de fazer chamadas HTTP, resolver o provider da instancia e delegar para o modulo de abstracao. Isso permite reutilizar 100% da logica de negocio existente (autenticacao, validacao de tenant, logging, billing, etc.).

### Fase 4: Adaptar evolution-webhook/index.ts

Criar um novo webhook endpoint `supabase/functions/uazapi-webhook/index.ts` para receber eventos da uazapi. A uazapi envia payloads diferentes da Evolution:

- Evento `messages` -> equivalente a `MESSAGES_UPSERT`
- Evento `connection` -> equivalente a `CONNECTION_UPDATE`
- Evento `messages_update` -> equivalente a `MESSAGES_UPDATE`

O webhook da uazapi ira normalizar os payloads para o formato interno e reutilizar a logica de processamento existente.

### Fase 5: UI - Selector de Provider na Pagina de Conexoes

Na pagina `/connections` (tenant) e `/global-admin/connections`:
- Ao criar nova instancia, permitir escolher "Evolution API" ou "uazapi"
- Mostrar badge indicando o provider de cada instancia
- Para uazapi: pedir subdomain e token (em vez de API URL + API Key)

### Fase 6: Configuracao Global

Adicionar na tabela `evolution_api_connections` (ou criar `whatsapp_api_providers`) suporte para armazenar credenciais do servidor uazapi LITE (admintoken).

## Detalhes Tecnicos

### Arquivo: `supabase/functions/_shared/whatsapp-provider.ts` (NOVO)

Modulo com interface `WhatsAppProvider` e duas implementacoes:
- `EvolutionProvider`: encapsula todas as chamadas Evolution API existentes
- `UazapiProvider`: implementa a mesma interface usando endpoints uazapi

Funcoes exportadas:
- `getProvider(instance)` -> retorna o provider correto baseado em `api_provider`
- `sendText(provider, number, text, options?)` 
- `sendMedia(provider, number, mediaType, mediaUrl/base64, options?)`
- `connectInstance(provider)` -> retorna QR code
- `getInstanceStatus(provider)` -> retorna status normalizado
- `configureWebhook(provider, webhookUrl, events)` 
- `disconnectInstance(provider)`

### Arquivo: `supabase/functions/uazapi-webhook/index.ts` (NOVO)

Webhook dedicado para receber eventos da uazapi. Normaliza payloads para o formato interno:
- Campo `number` da uazapi -> `remoteJid` do formato interno
- Estrutura de mensagem da uazapi -> estrutura de mensagem interna
- Eventos de conexao -> mapeamento de estados

### Arquivo: `supabase/functions/evolution-api/index.ts` (MODIFICAR)

Para cada action no switch, adicionar resolucao de provider:
1. Buscar instancia no banco
2. Verificar `api_provider`
3. Delegar para `EvolutionProvider` ou `UazapiProvider`

### Migration SQL

```sql
-- Adicionar coluna de provider
ALTER TABLE public.whatsapp_instances 
ADD COLUMN api_provider text NOT NULL DEFAULT 'evolution';

-- Atualizar view segura
CREATE OR REPLACE VIEW public.whatsapp_instances_safe AS
SELECT id, instance_name, display_name, status, phone_number, 
       law_firm_id, created_at, updated_at, api_provider,
       -- demais campos exceto api_key e api_key_encrypted
FROM public.whatsapp_instances;
```

### Secrets Necessarios

- `UAZAPI_ADMIN_TOKEN`: Token administrativo do servidor LITE para operacoes de gerenciamento

## Ordem de Implementacao

1. Migration SQL (adicionar `api_provider`)
2. Criar `_shared/whatsapp-provider.ts`
3. Criar `uazapi-webhook/index.ts`
4. Adaptar `evolution-api/index.ts` para usar provider pattern
5. Adaptar UI de criacao de instancia
6. Testes com instancia uazapi real

## Riscos e Consideracoes

- **Escopo grande**: A migracao envolve refatorar ~5.000 linhas na evolution-api e criar ~1.000 linhas do webhook uazapi. Sera feito em etapas.
- **Persistencia de midia**: uazapi retorna midias via base64 diretamente, simplificando a persistencia vs Evolution que requer endpoint separado.
- **Webhook anti-loop**: uazapi tem filtro `excludeMessages: ["wasSentByApi"]` nativo, eliminando a necessidade da logica manual de deduplicacao.
- **Sem auto-hospedagem**: Com uazapi, nao ha necessidade de gerenciar servidor, Docker, Baileys, nem lidar com bugs de sessao. A estabilidade e responsabilidade do provedor.

