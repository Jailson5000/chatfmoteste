

# Listar Contas Instagram para Selecao (Page Picker)

## Problema atual

O Instagram conectou com sucesso (a conta "MiauChat - Solucoes Digitais (@miau.chat)" esta salva no banco). Porem, o fluxo atual do Instagram Business Login conecta automaticamente a primeira conta sem mostrar uma lista de opcoes, diferente do que o usuario espera (como o Facebook faz no dialogo OAuth).

## Causa raiz

O fluxo atual do Instagram usa o **Instagram Business Login** (`instagram.com/oauth/authorize`), que autentica uma unica conta Instagram por vez. Diferente do Facebook OAuth que retorna `me/accounts` (todas as paginas), a API do Instagram retorna apenas o token da conta autorizada.

Para listar todas as contas Instagram disponiveis, precisamos usar o **Facebook OAuth** com o scope `instagram_business_basic`, que retorna todas as paginas do Facebook com suas contas Instagram vinculadas.

## Solucao proposta

Implementar um fluxo de dois passos para Instagram:

1. **Passo 1**: Backend troca o codigo OAuth e retorna a lista de paginas com contas Instagram vinculadas (sem salvar ainda)
2. **Passo 2**: Frontend mostra um dialog de selecao de conta. Usuario escolhe qual conta conectar
3. **Passo 3**: Frontend envia a pagina selecionada ao backend, que salva a conexao

## Alteracoes tecnicas

### 1. Backend: `supabase/functions/meta-oauth-callback/index.ts`

- Adicionar suporte a um parametro `step` no body da requisicao
- `step: "list_pages"` (ou ausencia de `pageId`): retorna lista de paginas com contas Instagram vinculadas, SEM salvar
- `step: "save"` (ou presenca de `pageId`): salva a conexao da pagina selecionada (fluxo atual)
- Mudar o fluxo Instagram para usar o Facebook OAuth (Graph API `me/accounts`) em vez do Instagram Business Login, para poder listar todas as paginas

### 2. Frontend: `src/lib/meta-config.ts`

- Atualizar `buildMetaOAuthUrl("instagram")` para usar o Facebook OAuth dialog em vez do Instagram dialog
- Adicionar scope `instagram_basic,instagram_manage_messages,pages_show_list` ao fluxo Instagram via Facebook

### 3. Frontend: Novo componente `src/components/settings/integrations/InstagramPagePickerDialog.tsx`

- Dialog/Sheet que recebe a lista de paginas com contas Instagram
- Mostra nome da pagina, nome da conta Instagram e foto
- Botao "Conectar" por pagina
- Loading state durante a conexao

### 4. Frontend: `src/components/settings/integrations/InstagramIntegration.tsx`

- Modificar `handleConnect` para:
  1. Abrir popup OAuth (usando Facebook dialog)
  2. Ao receber o codigo, chamar backend com `step: "list_pages"`
  3. Mostrar o `InstagramPagePickerDialog` com as paginas retornadas
  4. Quando usuario selecionar uma pagina, chamar backend com `step: "save"` e o `pageId`

### 5. Deploy

- Redeployer edge function `meta-oauth-callback`

## Fluxo resumido

```text
[Usuario clica Conectar]
        |
[Popup Facebook OAuth abre]
        |
[Usuario autoriza acesso]
        |
[Codigo retorna ao frontend]
        |
[Frontend chama backend: step="list_pages"]
        |
[Backend retorna lista de paginas com IG vinculado]
        |
[Dialog de selecao aparece na tela]
        |
[Usuario escolhe conta Instagram]
        |
[Frontend chama backend: step="save" + pageId]
        |
[Conexao salva e UI atualiza]
```

## Observacoes

- O fluxo do Facebook NAO sera alterado (conforme solicitado)
- A conta Instagram ja conectada ("miau.chat") continuara funcionando normalmente
- Se o usuario tiver apenas uma conta Instagram vinculada, o dialog ainda aparecera para confirmacao

