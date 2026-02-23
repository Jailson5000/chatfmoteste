
## Corrigir Download de Midias e Persistencia — IMPLEMENTADO ✅

### Correções Aplicadas

1. **Webhook: credenciais da instância** — `evolution-webhook` agora usa `instance.api_url` e `instance.api_key` em vez de env vars globais (`EVOLUTION_BASE_URL`, `EVOLUTION_GLOBAL_API_KEY`)
2. **Persist-on-download** — `evolution-api` (`get_media`) agora persiste a mídia no bucket `chat-media` ao descriptografar com sucesso, e atualiza `messages.media_url` com a URL permanente
3. **Redeployado** — Ambas as edge functions foram redeployadas com sucesso

### Como Testar

- Peça para um cliente enviar um novo arquivo pelo WhatsApp
- O log `MEDIA_PERSIST` deve aparecer nos logs do `evolution-webhook`
- O campo `media_url` da mensagem deve conter uma URL do Storage (não mais `mmg.whatsapp.net`)
- Para mensagens antigas: ao clicar em baixar, se a Evolution API conseguir descriptografar, o arquivo será persistido e futuros downloads serão diretos
