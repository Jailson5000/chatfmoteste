
# Plano: Trocar OAuth Simples pelo Meta Embedded Signup

## Resumo

O fluxo atual abre um popup com OAuth generico do Facebook que apenas pede permissoes. O LiderHub (nas imagens de referencia) usa o **Meta Embedded Signup** -- um fluxo guiado dentro do popup onde o proprio cliente:

1. Seleciona/cria o portfolio empresarial
2. Seleciona/cria a conta WhatsApp Business
3. Insere os dados da empresa (nome, pais, site, setor)
4. Insere e verifica o numero de telefone

Esse fluxo retorna diretamente o `code`, `waba_id` e `phone_number_id` no callback JavaScript -- sem necessidade de buscar via Graph API depois.

## O Que Muda

### Antes (OAuth simples):
- Popup redireciona para `facebook.com/dialog/oauth`
- Retorna `code` via redirect para `/auth/meta-callback`
- Edge function precisa buscar WABA e phone numbers via Graph API

### Depois (Embedded Signup):
- Facebook JS SDK carregado na pagina
- `FB.login()` com `config_id` abre o wizard guiado
- Callback JavaScript recebe `code` + `phone_number_id` + `waba_id` diretamente
- Edge function so precisa trocar o `code` por token e salvar
- SEM redirect de pagina -- tudo acontece no popup + callback JS

## Pre-requisito

Voce precisa criar um **Facebook Login for Business Configuration** no Meta App Dashboard:
1. App Dashboard > Facebook Login for Business > Configurations
2. Criar nova configuracao com variante "Embedded Signup"
3. Selecionar produto "WhatsApp - Cloud API"
4. Copiar o `config_id` gerado

Esse `config_id` sera salvo como variavel de ambiente `VITE_META_CONFIG_ID`.

## Secao Tecnica

### Arquivos a modificar:

| Arquivo | Mudanca |
|---------|---------|
| `index.html` | Adicionar script do Facebook SDK (`connect.facebook.net/pt_BR/sdk.js`) |
| `src/components/connections/NewWhatsAppCloudDialog.tsx` | Reescrever para usar `FB.login()` com `config_id` e capturar `code` + `phone_number_id` + `waba_id` via callback JS, depois chamar edge function diretamente |
| `supabase/functions/meta-oauth-callback/index.ts` | Simplificar o handler `whatsapp_cloud`: receber `code` + `phoneNumberId` + `wabaId` do frontend, trocar code por token, salvar -- sem precisar buscar WABA/phones via Graph API |

### Fluxo detalhado:

```text
1. Usuario clica "Conectar com Facebook" no dialog
2. FB.login() abre popup do Embedded Signup com config_id
3. Cliente passa pelo wizard guiado:
   a. Seleciona portfolio empresarial
   b. Cria/seleciona conta WhatsApp Business
   c. Insere dados da empresa
   d. Insere e verifica numero de telefone
4. Callback JS recebe: { code, phone_number_id, waba_id }
5. Frontend chama meta-oauth-callback com esses dados
6. Edge function:
   a. Troca code por token (sem redirect_uri!)
   b. Encripta token
   c. Salva na meta_connections
7. Dialog mostra toast de sucesso e fecha
```

### Codigo do FB.login (conceito):

```text
FB.login((response) => {
  if (response.authResponse) {
    const code = response.authResponse.code;
    // sessionInfoListener retorna waba_id e phone_number_id
  }
}, {
  config_id: VITE_META_CONFIG_ID,
  response_type: 'code',
  override_default_response_type: true,
  extras: { setup: {} }
});
```

### Mudanca no meta-oauth-callback:

Quando `type === "whatsapp_cloud"` e `phoneNumberId` + `wabaId` vierem do frontend:
- Nao precisa mais fazer `GET /page_id?fields=whatsapp_business_account`
- Nao precisa mais fazer `GET /waba_id/phone_numbers`
- So troca code por token e salva direto

A troca de code por token no Embedded Signup **nao usa redirect_uri** -- usa `https://graph.facebook.com/oauth/access_token?client_id=X&client_secret=Y&code=Z`

### Sobre o MetaAuthCallback.tsx:

A pagina `/auth/meta-callback` **nao muda** e continua funcionando para Instagram e Facebook (que usam redirect). O WhatsApp Cloud nao vai mais usar redirect -- tudo fica no callback JS do `FB.login()`.

### Nova variavel de ambiente necessaria:

- `VITE_META_CONFIG_ID` -- o Configuration ID do Facebook Login for Business (criado no Meta App Dashboard)

### Ordem de implementacao:

1. Pedir ao usuario o `VITE_META_CONFIG_ID`
2. Adicionar Facebook SDK no `index.html`
3. Reescrever `NewWhatsAppCloudDialog.tsx` com Embedded Signup
4. Simplificar handler `whatsapp_cloud` no `meta-oauth-callback`
5. Re-deploy da edge function
