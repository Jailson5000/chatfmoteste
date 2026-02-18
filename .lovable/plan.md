

# Corrigir Deteccao de Permissoes Instagram - FMO

## Problema

A conta Instagram da FMO nao recebe mensagens porque, durante o fluxo OAuth, os ativos do Instagram nao foram selecionados na tela "Escolher ativos" da Meta. O sistema atualmente nao detecta esse problema - a inscricao `subscribed_apps` retorna sucesso, mas isso so se aplica ao Facebook Messenger, nao ao Instagram DM.

A Meta envia webhooks de Instagram DM pelo objeto "Instagram", que depende de a conta IG ter autorizado o app com `instagram_manage_messages` nos ativos corretos. Sem isso, a conta nao aparece nos "Limites de volume do Instagram" e nenhum evento chega.

## Solucao

### 1. Adicionar verificacao de token no fluxo de conexao (`meta-oauth-callback`)

Apos salvar a conexao Instagram, usar a API `debug_token` da Meta para verificar se o token realmente tem a permissao `instagram_manage_messages`:

```
GET /debug_token?input_token={page_token}&access_token={app_id}|{app_secret}
```

Se a permissao nao estiver presente no token, retornar um aviso claro para o frontend informando que o usuario precisa reconectar e selecionar os ativos corretos.

### 2. Melhorar o diagnostico (`meta-api` acao `diagnose`)

Adicionar verificacao de `debug_token` na acao `diagnose` para mostrar as permissoes reais do token. Isso permite ao usuario ver imediatamente se o problema e de permissao.

### 3. Atualizar o frontend com aviso claro

No `InstagramIntegration.tsx`, exibir um aviso quando o diagnostico detectar que a permissao `instagram_manage_messages` esta ausente, com instrucoes claras:

- "Desconecte e reconecte o Instagram"
- "Na tela de autorizacao da Meta, selecione: Paginas + Contas do Instagram"

## Detalhes Tecnicos

### Arquivo: `supabase/functions/meta-oauth-callback/index.ts`

No bloco de save do Instagram (apos a inscricao do webhook), adicionar:

```typescript
// Verify token permissions via debug_token
try {
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  const debugRes = await fetch(
    `${GRAPH_API_BASE}/debug_token?input_token=${pageAccessToken}&access_token=${appId}|${appSecret}`
  );
  const debugData = await debugRes.json();
  const scopes = debugData.data?.scopes || [];
  const hasIgMessaging = scopes.includes("instagram_manage_messages");
  console.log("[meta-oauth] Token debug:", {
    scopes,
    hasIgMessaging,
    appId: debugData.data?.app_id,
    type: debugData.data?.type,
  });

  if (!hasIgMessaging) {
    console.warn("[meta-oauth] Token MISSING instagram_manage_messages!");
    // Still save connection but return warning
    return Response with warning flag
  }
} catch (debugErr) {
  console.warn("[meta-oauth] debug_token check failed:", debugErr);
}
```

### Arquivo: `supabase/functions/meta-api/index.ts` (acao `diagnose`)

Adicionar verificacao de `debug_token` no relatorio de diagnostico:

```typescript
// Check 5: Token permissions via debug_token
try {
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  const debugRes = await fetch(
    `${GRAPH_API_BASE}/debug_token?input_token=${diagToken}&access_token=${appId}|${appSecret}`
  );
  const debugData = await debugRes.json();
  report.checks.tokenPermissions = {
    scopes: debugData.data?.scopes || [],
    hasInstagramManageMessages: (debugData.data?.scopes || []).includes("instagram_manage_messages"),
    type: debugData.data?.type,
    isValid: debugData.data?.is_valid,
  };
} catch (err) {
  report.checks.tokenPermissions = { error: String(err) };
}
```

### Arquivo: `src/components/settings/integrations/InstagramIntegration.tsx`

Atualizar o dialog de diagnostico para mostrar um alerta quando `instagram_manage_messages` estiver ausente:

```typescript
{diagReport?.checks?.tokenPermissions && !diagReport.checks.tokenPermissions.hasInstagramManageMessages && (
  <div className="bg-destructive/10 border border-destructive/30 rounded p-3">
    <h4 className="font-medium text-destructive mb-1">Permissao ausente!</h4>
    <p className="text-xs">O token NAO possui a permissao instagram_manage_messages.
    A Meta nao enviara mensagens do Instagram para o sistema.</p>
    <p className="text-xs mt-1 font-medium">Para corrigir:</p>
    <ol className="text-xs list-decimal ml-4 mt-1">
      <li>Desconecte o Instagram abaixo</li>
      <li>Reconecte clicando em "Conectar"</li>
      <li>Na tela da Meta, selecione "Paginas" E "Contas do Instagram" nos ativos</li>
    </ol>
  </div>
)}
```

## Arquivos Alterados

1. `supabase/functions/meta-oauth-callback/index.ts` - verificacao de permissoes via `debug_token` apos salvar
2. `supabase/functions/meta-api/index.ts` - adicionar `debug_token` no diagnostico
3. `src/components/settings/integrations/InstagramIntegration.tsx` - exibir alerta de permissao ausente

## Acao Imediata do Usuario

Apos o deploy, o usuario deve:
1. Usar o botao "Diagnostico" para confirmar que `instagram_manage_messages` esta ausente
2. Desconectar o Instagram da FMO
3. Reconectar, e na tela de autorizacao da Meta, marcar **Paginas** E **Contas do Instagram** nos ativos
4. Verificar novamente com o diagnostico que a permissao esta presente

## Impacto

- Baixo risco: apenas adiciona verificacoes, nao altera fluxos existentes
- Previne problemas futuros: o sistema agora avisa quando a permissao esta ausente
- Resolve o problema raiz: guia o usuario a conceder os ativos corretos

