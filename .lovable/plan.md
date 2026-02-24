
# Corrigir Criacao de Instancia uazapi - Fluxo de 2 Etapas

## Problema Encontrado

A API do uazapi tem um fluxo de 2 etapas que o codigo atual NAO segue:

1. **Etapa 1 - Criar instancia:** `POST /instance/init` com header `admintoken` -- retorna um `token` unico da instancia
2. **Etapa 2 - Conectar (QR Code):** `POST /instance/connect` com header `token` (token DA INSTANCIA, nao o admin)

O codigo atual pula a Etapa 1 e vai direto para `/instance/connect` usando o `admintoken` no header `token`. O servidor rejeita com 401 porque `/instance/connect` espera um token de instancia, nao o token admin.

```text
Fluxo CORRETO:
  POST /instance/init + admintoken  -->  { token: "abc123..." }
  POST /instance/connect + token    -->  { qrcode: "base64..." }

Fluxo ATUAL (bugado):
  POST /instance/connect + admintoken  -->  401 Invalid Token
```

## Solucao

### 1. Corrigir UazapiProvider no modulo compartilhado

**Arquivo:** `supabase/functions/_shared/whatsapp-provider.ts`

Adicionar metodo `createInstance()` ao UazapiProvider:
- Chama `POST /instance/init` com header `admintoken` e body `{ name: instanceName }`
- Retorna o token da instancia criada
- Depois chama `POST /instance/connect` com o token da instancia para gerar o QR code

Corrigir o metodo `connect()`:
- Manter como esta (usa header `token`) -- esta correto para reconexoes onde ja temos o token

Corrigir `configureWebhook()`:
- Usa o token da instancia (header `token`), nao o admin token -- isso ja esta correto

### 2. Atualizar o fluxo create_instance na edge function

**Arquivo:** `supabase/functions/evolution-api/index.ts` (linhas 588-673)

Alterar o bloco uazapi do `create_instance` para:
1. Chamar `POST /instance/init` com `admintoken` header e `{ name: instanceName }` no body
2. Capturar o `token` retornado pela API
3. Chamar `POST /instance/connect` com o token da instancia para obter o QR code
4. Configurar webhook com o token da instancia
5. Salvar no banco `api_key = token_da_instancia` (nao o admin token)

Isso garante que todas operacoes futuras (enviar mensagem, status, etc.) usem o token correto da instancia.

### 3. Remover mencao "uazapi" nas mensagens de erro do provider

**Arquivo:** `supabase/functions/_shared/whatsapp-provider.ts`

Trocar strings como `"uazapi connect failed"` por mensagens sem nome de provedor, ex: `"Falha ao conectar instancia"`.

## Resumo das Alteracoes

| Arquivo | O que muda |
|---|---|
| `supabase/functions/_shared/whatsapp-provider.ts` | Adicionar `createInstance()` ao UazapiProvider que faz init + connect em 2 etapas |
| `supabase/functions/evolution-api/index.ts` | Usar novo fluxo de 2 etapas no `create_instance` para uazapi |

## Resultado Esperado

- Cliente clica "Criar Conexao", digita o nome
- Sistema cria instancia no uazapi automaticamente (init + connect)
- QR Code aparece para escanear
- Webhook configurado automaticamente
- Token da instancia salvo no banco para operacoes futuras
