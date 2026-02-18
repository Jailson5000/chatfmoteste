

# Corrigir Instagram - Redeploy e Orientacoes

## Problemas Identificados

### 1. Edge function nao foi redeployada
O codigo no repositorio tem a correcao do IGID (usar `me.user_id` em vez de `tokenData.user_id`), mas a versao deployada ainda e antiga. Prova nos logs:

- Webhook tentou com ID `25982752248032036` (app-scoped) - ERRADO
- O `/me` retornou `17841479677897649` (IGID) - CORRETO mas nao foi usado
- DB salvou `page_id: 25982752248032036` - ERRADO

### 2. Conta errada conectada
Os logs mostram `username: "miau.chat"` conectada. O Instagram da FMO mostra "Nenhum app ativo" porque a autorizacao foi feita na conta do MiauChat, nao na FMO.

### 3. Comportamento do Instagram Business Login
Com Instagram Business Login (nativo), **nao existe seletor de pagina/conta**. Ele conecta automaticamente a conta Instagram que esta logada no navegador. Isso e comportamento correto da API da Meta.

## Correcoes

### Acao 1: Redesenhar o meta-oauth-callback (sem alteracao de codigo)
O codigo no repositorio JA esta correto. So precisa ser redeployado. A edge function sera forçada a redesenhar para garantir que a versao mais recente esteja rodando.

### Acao 2: Adicionar instrucoes no frontend
Atualizar o componente `InstagramIntegration.tsx` para mostrar uma instrucao ao usuario antes de abrir o popup OAuth, explicando que ele deve estar logado na conta Instagram correta no navegador.

Adicionar um toast informativo ou texto descritivo:
```
"Importante: Antes de conectar, certifique-se de estar logado na conta Instagram correta no seu navegador."
```

### Acao 3: Forcionar o redeploy da edge function
Adicionar um comentario ou pequena alteracao no `meta-oauth-callback/index.ts` para forcar o rebuild e deploy da versao correta que ja tem a correcao do IGID.

## Passos apos deploy

1. **Desconectar** a conexao atual (miau.chat) no sistema
2. **Fazer logout** do Instagram no navegador
3. **Fazer login** na conta Instagram da FMO no navegador
4. **Clicar "Conectar"** no painel - agora vai conectar a conta da FMO com o IGID correto
5. No app do Instagram da FMO, verificar em Configuracoes > Privacidade > Apps e sites que o MiauChat-IG aparece como ativo
6. Ativar "Permitir acesso a mensagens" em Configuracoes > Mensagens > Ferramentas conectadas

## Arquivos Alterados

1. `supabase/functions/meta-oauth-callback/index.ts` - Forcar redeploy (comentario de versao)
2. `src/components/settings/integrations/InstagramIntegration.tsx` - Adicionar instrucao sobre conta logada

