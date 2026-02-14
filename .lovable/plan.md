

# Corrigir Erro do Instagram: Codigo OAuth Usado Duas Vezes

## Problema

O fluxo de dois passos do Instagram esta falhando porque o backend tenta trocar o **mesmo codigo OAuth duas vezes**:

1. **Passo 1 (list_pages)**: Backend troca o codigo por token, busca paginas, retorna a lista -- **funciona**
2. **Passo 2 (save)**: Backend tenta trocar o **mesmo codigo** novamente -- **FALHA** porque codigos OAuth sao de uso unico

O erro "Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request" e a mensagem generica que a Meta retorna quando o codigo ja foi consumido.

O Facebook funciona porque NAO usa dois passos -- ele salva direto.

## Solucao

Passar os tokens das paginas (criptografados) na resposta do `list_pages`, e no passo `save` o frontend envia o token criptografado de volta ao backend, eliminando a necessidade de trocar o codigo novamente.

## Alteracoes tecnicas

### 1. Backend: `supabase/functions/meta-oauth-callback/index.ts`

**No passo `list_pages`** (tipo instagram):
- Incluir o `pageAccessToken` criptografado na resposta de cada pagina

**No passo `save`** (tipo instagram):
- Aceitar um novo campo `encryptedPageToken` no body da requisicao
- Se `encryptedPageToken` estiver presente, pular a troca de codigo e usar o token diretamente (descriptografar)
- Se nao estiver presente, manter o fluxo atual como fallback

Nenhuma alteracao no fluxo do Facebook.

### 2. Frontend: `src/components/settings/integrations/InstagramIntegration.tsx`

- Na resposta de `list_pages`, armazenar o `encryptedToken` de cada pagina junto com os dados da pagina
- No passo `save`, enviar o `encryptedPageToken` da pagina selecionada em vez do `code`

### 3. Frontend: `src/components/settings/integrations/InstagramPagePickerDialog.tsx`

- Atualizar o tipo `InstagramPage` para incluir o campo opcional `encryptedToken`

### 4. Deploy

- Redeployer edge function `meta-oauth-callback`

## Fluxo corrigido

```text
[OAuth popup] --> codigo
      |
[list_pages] --> troca codigo por token (1x)
      |          retorna paginas + tokens criptografados
      |
[Dialog picker] --> usuario escolhe pagina
      |
[save] --> envia encryptedPageToken (SEM codigo)
      |     backend descriptografa e salva
      |
[Conexao salva]
```

## O que NAO muda

- Fluxo do Facebook (nenhuma alteracao)
- Fluxo do WhatsApp Cloud (nenhuma alteracao)
- Logica de webhook e envio de mensagens
- Criptografia e seguranca dos tokens

