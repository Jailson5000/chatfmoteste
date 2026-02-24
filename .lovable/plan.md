
# Integração Dual-Provider (uazapi) - COMPLETA

## Status: ✅ Fase 1 + Fase 2 implementadas

### Fase 1 (Concluída)
- ✅ Migration SQL: coluna `api_provider` em `whatsapp_instances`
- ✅ Módulo `_shared/whatsapp-provider.ts` com EvolutionProvider + UazapiProvider
- ✅ Webhook `uazapi-webhook/index.ts`
- ✅ Dialog `NewInstanceDialog` com selector de provider

### Fase 2 (Concluída)
- ✅ `useWhatsAppInstances.tsx`: campo `provider` em `CreateInstanceParams`
- ✅ `Connections.tsx`: `handleCreateInstance` aceita provider/uazapiUrl/uazapiToken
- ✅ `evolution-api/index.ts`: `create_instance` com fluxo uazapi completo
- ✅ Provider detection em todas as actions principais:
  - `get_qrcode`, `get_status`, `refresh_status`, `refresh_phone`
  - `configure_webhook`, `get_settings`, `set_settings`
  - `delete_instance`, `logout_instance`
- ✅ Badge de provider (EVO/UAZAPI) na tabela de conexões

### Pendente (Fase 3 - quando necessário)
- [ ] Provider detection em `send_message_async` e `send_media_async` (alto impacto, requer refactor cuidadoso das background tasks)
- [ ] Provider detection em `send_message` e `send_media` sync
- [ ] Provider detection em `delete_message`, `send_reaction`, `fetch_profile_picture`
- [ ] Provider detection nos endpoints `global_*` (admin)
- [ ] Testes com instância uazapi real
