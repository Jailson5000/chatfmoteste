
# Corrigir Recebimento de Mensagens do Instagram - FMO

## Problema

O Instagram da FMO esta "Conectado" no sistema e o `subscribed_apps` retornou sucesso, mas a conta Instagram da FMO nao aparece nos "Limites de volume do Instagram" no painel da Meta. Isso significa que a Meta nao esta enviando eventos de webhook para essa conta.

## Analise

Dados do banco de dados:
- FMO tem Facebook e Instagram conectados usando a **mesma pagina** (`119080757952130`)
- Facebook conectado as 18:55:39, Instagram as 18:56:40 (apenas 1 minuto depois)
- MiauChat (funciona) teve Facebook conectado 1.5 horas antes do Instagram

O `POST /{page_id}/subscribed_apps` retornou sucesso, mas isso apenas inscreve a Pagina para webhooks. Para Instagram, a Meta tambem precisa reconhecer a conta IG Business como conectada ao app para mensagens.

## Solucao

### 1. Adicionar acao `resubscribe` na Edge Function `meta-api`

Nova acao que:
- Busca a conexao Instagram do tenant
- Decripta o token salvo
- Faz `GET /{page_id}/subscribed_apps` para verificar o status atual da inscricao
- Faz `POST /{page_id}/subscribed_apps` para re-inscrever
- Retorna o resultado detalhado para o frontend

### 2. Adicionar acao `diagnose` na Edge Function `meta-api`

Nova acao que:
- Verifica se a inscricao esta ativa via `GET /{page_id}/subscribed_apps`
- Testa acesso ao IG account via Graph API
- Verifica validade do token
- Retorna relatorio completo

### 3. Atualizar Frontend do Instagram

No `InstagramIntegration.tsx`:
- Ao ativar o toggle (toggle ON), automaticamente chamar `resubscribe` para garantir inscricao
- Alterar botao de configuracoes para mostrar diagnostico real
- Adicionar botao "Reinscrever" no painel de configuracoes

### 4. Melhorar a inscricao no OAuth Callback

No `meta-oauth-callback/index.ts`:
- Apos o `POST subscribed_apps`, fazer um `GET subscribed_apps` para VERIFICAR se a inscricao realmente esta ativa
- Logar o resultado da verificacao
- Se a verificacao falhar, tentar novamente apos 2 segundos (retry)

## Detalhes Tecnicos

### Nova acao `resubscribe` (meta-api):

```typescript
if (action === "resubscribe") {
  // 1. Buscar conexao pelo connectionId ou pelo tenant
  // 2. Decriptar token
  // 3. GET /{page_id}/subscribed_apps para ver status atual
  // 4. POST /{page_id}/subscribed_apps com messages,messaging_postbacks,messaging_optins
  // 5. GET /{page_id}/subscribed_apps novamente para confirmar
  // 6. Retornar resultado detalhado
}
```

### Toggle ON com resubscribe (InstagramIntegration.tsx):

```typescript
const toggleMutation = useMutation({
  mutationFn: async (isActive: boolean) => {
    // Atualizar status no banco
    await supabase.from("meta_connections").update({ is_active: isActive }).eq("id", connection.id);
    // Se ativando, re-inscrever automaticamente
    if (isActive) {
      await supabase.functions.invoke("meta-api", {
        body: { action: "resubscribe", connectionId: connection.id }
      });
    }
  }
});
```

### Verificacao pos-inscricao (meta-oauth-callback):

```typescript
// Apos POST subscribed_apps, verificar:
const verifyRes = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps?access_token=${pageAccessToken}`);
const verifyData = await verifyRes.json();
console.log("[meta-oauth] Subscription verification:", JSON.stringify(verifyData));
```

## Arquivos Alterados

1. `supabase/functions/meta-api/index.ts` - adicionar acoes `resubscribe` e `diagnose`
2. `supabase/functions/meta-oauth-callback/index.ts` - adicionar verificacao pos-inscricao com retry
3. `src/components/settings/integrations/InstagramIntegration.tsx` - resubscribe automatico ao ativar + botao de diagnostico

## Acao Imediata Apos Deploy

Depois que o codigo for implementado, voce podera:
1. Desativar e reativar o Instagram da FMO no sistema (isso disparara o resubscribe automatico)
2. Ou usar o botao de diagnostico para verificar o status da inscricao

## Impacto

- Baixo risco: adiciona funcionalidade sem alterar fluxos existentes de envio/recebimento
- Resolve o problema caso a inscricao tenha falhado silenciosamente
- Previne problemas futuros com verificacao pos-inscricao
