

# Simplificar Criacao de Conexao WhatsApp (Sempre uazapi, Automatico)

## Problema Atual

1. O dialogo "Nova Conexao" mostra selector de provedor (Evolution/uazapi) e pede subdomain + token ao cliente
2. O cliente nao deveria ver nada tecnico -- so digitar o nome e escanear o QR
3. O webhook tem um bug: a funcao `uazapi-webhook` valida contra `UAZAPI_WEBHOOK_TOKEN` (que NAO existe nos secrets), mas a `evolution-api` monta a URL com `EVOLUTION_WEBHOOK_TOKEN`

## Solucao

### 1. Simplificar o NewInstanceDialog

Remover completamente:
- Selector de provedor (Evolution vs uazapi)
- Campos de subdomain e token

O dialogo ficara apenas com:
- Campo "Nome da Conexao" (ex: "WhatsApp Principal")
- Botao "Criar Conexao"

### 2. Buscar credenciais uazapi automaticamente no backend

Alterar o `create_instance` na edge function `evolution-api` para:
- Quando `provider === 'uazapi'` e `apiUrl`/`apiKey` nao forem fornecidos, buscar automaticamente da tabela `system_settings` (`uazapi_server_url` e `uazapi_admin_token`)
- Remover a validacao que exige `apiUrl` e `apiKey` obrigatorios para uazapi

### 3. Ajustar handleCreateInstance no Connections.tsx

Sempre enviar `provider: "uazapi"` sem `apiUrl`/`apiKey` -- o backend resolve sozinho.

### 4. Corrigir o bug do webhook token

A funcao `uazapi-webhook` valida contra `Deno.env.get("UAZAPI_WEBHOOK_TOKEN")`, mas esse secret NAO existe. O que existe e `EVOLUTION_WEBHOOK_TOKEN`.

Correcao: alterar `uazapi-webhook/index.ts` para ler `EVOLUTION_WEBHOOK_TOKEN` em vez de `UAZAPI_WEBHOOK_TOKEN` (ja que a `evolution-api` monta a URL com esse mesmo token).

### 5. Simplificar botao "Nova Conexao"

Remover o dropdown com opcoes (QR Code / Cloud API). O botao "Nova Conexao" abre diretamente o dialogo simplificado.

## Sobre o Webhook (resposta a sua pergunta)

A configuracao na imagem esta **quase correta**, porem:
- O token na URL (`Meupau110591`) precisa corresponder ao valor do secret `EVOLUTION_WEBHOOK_TOKEN` no backend
- O webhook e configurado **automaticamente** pelo sistema ao criar a instancia, entao voce nao precisa configurar manualmente -- desde que o bug do token seja corrigido

## Arquivos a Alterar

| Arquivo | Alteracao |
|---|---|
| `src/components/connections/NewInstanceDialog.tsx` | Remover selector de provedor e campos uazapi. So pedir nome |
| `src/pages/Connections.tsx` | Simplificar `handleCreateInstance` para sempre usar uazapi. Remover dropdown do botao |
| `supabase/functions/evolution-api/index.ts` | No `create_instance` uazapi: buscar credenciais de `system_settings` quando nao fornecidas |
| `supabase/functions/uazapi-webhook/index.ts` | Trocar `UAZAPI_WEBHOOK_TOKEN` para `EVOLUTION_WEBHOOK_TOKEN` |

Nenhuma migracao SQL necessaria.

