

# Plano: WhatsApp Cloud via OAuth (Embedded Signup) em vez de Token Manual

## O Problema Atual

O dialog atual pede ao cliente 3 campos manuais:
- Nome da Conexao
- Phone Number ID (que o cliente precisa achar no Meta Developers)
- Access Token Permanente (que o cliente precisa gerar em System Users)

Isso e inviavel para usuarios comuns. A segunda imagem de referencia (LiderHub) mostra o caminho correto: o cliente clica um botao, abre o popup do Facebook, loga, autoriza, e pronto.

## A Boa Noticia

Voce **ja tem toda a infraestrutura pronta**:
- `META_APP_ID` e `META_APP_SECRET` configurados como secrets
- Edge Function `meta-oauth-callback` ja troca code por token, pega pages, encripta e salva na `meta_connections`
- `MetaAuthCallback.tsx` ja processa o redirect
- Instagram e Facebook ja usam exatamente esse fluxo

## O Que Muda

Em vez do formulario manual com 3 campos, o fluxo sera identico ao do Instagram/Facebook:

1. Cliente clica em "WhatsApp Cloud (API Oficial)" no dropdown
2. Abre popup do Facebook com permissoes `whatsapp_business_management` + `whatsapp_business_messaging`
3. Cliente loga no Facebook e autoriza
4. Callback recebe o `code`, troca por token, busca o WABA (WhatsApp Business Account) e phone numbers automaticamente
5. Salva na `meta_connections` com type `whatsapp_cloud`

## Secao Tecnica

### Arquivos a modificar:

| Arquivo | Mudanca |
|---------|---------|
| `src/components/connections/NewWhatsAppCloudDialog.tsx` | Substituir formulario manual por fluxo OAuth com popup do Facebook (igual Instagram/Facebook) |
| `supabase/functions/meta-oauth-callback/index.ts` | Adicionar tratamento para `type === "whatsapp_cloud"`: buscar WABA e phone numbers via Graph API apos OAuth |
| `src/pages/MetaAuthCallback.tsx` | Ajustar para redirecionar para `/connections` (em vez de `/settings`) quando o type for `whatsapp_cloud` |
| `src/pages/Connections.tsx` | Ajustar chamada ao dialog -- o dialog agora inicia o popup OAuth diretamente |

### Fluxo detalhado:

```text
1. Usuario clica "WhatsApp Cloud (API Oficial)"
2. NewWhatsAppCloudDialog abre popup:
   facebook.com/v21.0/dialog/oauth
     ?client_id={META_APP_ID}
     &redirect_uri={origin}/auth/meta-callback
     &scope=whatsapp_business_management,whatsapp_business_messaging,business_management
     &state={"type":"whatsapp_cloud"}
     &response_type=code
3. Usuario loga no Facebook e autoriza
4. Redirect para /auth/meta-callback?code=XXX
5. MetaAuthCallback chama meta-oauth-callback com code + type
6. Edge Function:
   a. Troca code por short-lived token
   b. Troca por long-lived token (60 dias)
   c. GET /me/accounts para listar paginas
   d. Para cada pagina, busca phone_number_id via WABA
   e. Salva na meta_connections
7. Redireciona para /connections com toast de sucesso
```

### Mudanca no meta-oauth-callback para WhatsApp Cloud:

Quando `type === "whatsapp_cloud"`, apos obter o token e as pages, precisa:
1. Buscar o WABA ID vinculado a pagina: `GET /{page_id}?fields=whatsapp_business_account`
2. Buscar os phone numbers do WABA: `GET /{waba_id}/phone_numbers`
3. Salvar `page_id` = phone_number_id (para o webhook fazer match)
4. Salvar `page_name` = display_phone_number ou nome da pagina

### Mudanca no NewWhatsAppCloudDialog:

O dialog deixa de ser um formulario e vira apenas um botao "Conectar com Facebook" que abre o popup OAuth, identico ao que `InstagramIntegration.tsx` e `FacebookIntegration.tsx` ja fazem (linhas 83-98 do Instagram).

### Seguranca:

- Token e obtido via OAuth server-side (mais seguro que colar token manual)
- Token e automaticamente criptografado com AES-GCM antes de salvar
- Token tem validade de 60 dias (long-lived) -- pode implementar renovacao futura
- O `META_APP_SECRET` nunca sai do backend (edge function)
- Nenhum dado sensivel e exposto no frontend

### Vantagens sobre o fluxo manual:

- Cliente nao precisa acessar Meta Developers
- Cliente nao precisa gerar token permanente
- O phone_number_id e detectado automaticamente
- Mais seguro (token via OAuth em vez de colado manualmente)
- Mesmo padrao visual do Instagram/Facebook (consistencia UX)

### Ordem de implementacao:

1. Atualizar `meta-oauth-callback` para tratar `whatsapp_cloud` (buscar WABA + phone numbers)
2. Atualizar `NewWhatsAppCloudDialog` para usar popup OAuth em vez de formulario
3. Atualizar `MetaAuthCallback` para redirecionar corretamente por tipo
4. Atualizar `Connections.tsx` para integrar o novo fluxo
5. Re-deploy da edge function

