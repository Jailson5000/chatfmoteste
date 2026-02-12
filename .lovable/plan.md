

# Corrigir Fluxo OAuth do Instagram/Facebook

## Problemas Identificados

### Problema 1: Popup nao comunica com janela principal
O `window.open` abre um popup, a Meta redireciona para `/auth/meta-callback` dentro do popup, e o `navigate("/settings")` tambem acontece dentro do popup. A janela principal nunca recebe a notificacao de que a conexao foi feita.

### Problema 2: Codigo OAuth reutilizado (bug critico)
Quando a edge function retorna `action: "select_page"` (para escolher a pagina), o `MetaAuthCallback` tenta chamar a edge function novamente com o **mesmo codigo OAuth**. Codigos OAuth sao de uso unico -- a segunda chamada sempre falha.

## Solucao

Vamos trocar o popup por **redirecionamento direto** (`window.location.href`) e fazer a edge function **auto-selecionar a primeira pagina** em uma unica chamada, eliminando ambos os problemas.

### Mudanca 1: Usar redirecionamento em vez de popup

**Arquivos:** `src/components/settings/integrations/InstagramIntegration.tsx` e `FacebookIntegration.tsx`

Trocar:
```typescript
window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");
```
Por:
```typescript
window.location.href = authUrl;
```

### Mudanca 2: Edge function auto-seleciona primeira pagina

**Arquivo:** `supabase/functions/meta-oauth-callback/index.ts`

Quando nenhum `pageId` e enviado, em vez de retornar `action: "select_page"` para o frontend escolher, a funcao automaticamente seleciona a primeira pagina disponivel (para Instagram, a primeira com conta Instagram vinculada) e salva a conexao em uma unica chamada.

Isso elimina a necessidade da segunda chamada com o codigo ja consumido.

### Mudanca 3: Simplificar MetaAuthCallback

**Arquivo:** `src/pages/MetaAuthCallback.tsx`

Remover toda a logica de "select_page" (segunda chamada), ja que a edge function agora resolve tudo em uma unica chamada. O callback simplesmente:
1. Recebe o codigo
2. Chama a edge function uma vez
3. Mostra toast de sucesso/erro
4. Redireciona para `/settings?tab=integrations`

## Resultado

- Clicar "Conectar" redireciona para Meta OAuth
- Apos autenticar, Meta redireciona de volta para `/auth/meta-callback`
- A edge function troca o codigo, pega token, encontra a pagina e salva -- tudo em uma chamada
- O usuario e redirecionado para Configuracoes com toast de sucesso
- A conexao aparece como ativa no card de Instagram/Facebook

