
# Integração Dual-Provider (uazapi) - Status

## Fase 1 ✅ COMPLETA
- Migration SQL (api_provider, uazapi_subdomain, uazapi_token)
- Módulo de abstração `_shared/whatsapp-provider.ts`
- Webhook `uazapi-webhook/index.ts`
- Dialog `NewInstanceDialog` com selector de provider

## Fase 2 ✅ COMPLETA
- Frontend: `useWhatsAppInstances` aceita `provider` param
- Frontend: `Connections.tsx` passa provider data
- Edge function: `create_instance` com suporte uazapi
- Provider detection em: `get_qrcode`, `get_status`, `refresh_status`, `refresh_phone`, `configure_webhook`, `get_settings`, `set_settings`, `delete_instance`, `logout_instance`
- Badge de provider (EVO/UAZAPI) na lista de instâncias

## Fase 3 ✅ COMPLETA
- `_shared/whatsapp-provider.ts`: adicionado `sendAudio`, `fetchProfilePicture` e helpers exportados
- Provider detection em:
  - `send_message` (sync) ✅
  - `send_media` (sync) ✅
  - `send_message_async` (background task + media template pattern) ✅
  - `send_media_async` (background task + audio PTT) ✅
  - `delete_message` ✅
  - `send_reaction` ✅
  - `fetch_profile_picture` ✅
  - `get_media` (guard para uazapi) ✅
- Deploy realizado ✅

## Pendente (Fase 4 - Futuro)
- `global_*` endpoints: manter Evolution-only (uazapi não usa gerenciamento centralizado)
- Testes end-to-end com instância uazapi real
- Monitoramento de erros em produção
