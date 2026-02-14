
# Separar conexao de teste da conexao OAuth do Instagram

## Problema

A pagina `/meta-test` e a pagina de Integracoes compartilham a mesma tabela `meta_connections`. Quando voce salva uma conexao manual de teste, o card do Instagram em Configuracoes > Integracoes automaticamente mostra "Conectado" porque encontra o registro na tabela. E quando voce clica "Desconectar" nas Integracoes, ele deleta o registro de teste tambem.

O comportamento correto e:
- A conexao de teste (meta-test) deve ficar salva independentemente
- O card do Instagram nas Integracoes so deve mostrar "Conectado" apos o fluxo OAuth (botao "Conectar")
- Desconectar nas Integracoes nao deve apagar a conexao de teste

## Solucao

Adicionar uma coluna `source` na tabela `meta_connections` para diferenciar conexoes manuais de teste (`manual_test`) de conexoes OAuth (`oauth`).

### 1. Migracao do banco de dados

Adicionar coluna `source` do tipo `text` com valor padrao `'oauth'`:

```sql
ALTER TABLE meta_connections 
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'oauth';
```

Isso faz com que todas as conexoes existentes sejam marcadas como `oauth` automaticamente.

### 2. `supabase/functions/meta-api/index.ts` (save_test_connection)

Na acao `save_test_connection`, ao fazer insert/update, incluir `source: 'manual_test'` no registro.

### 3. `src/components/settings/integrations/InstagramIntegration.tsx`

Alterar a query para filtrar apenas conexoes com `source = 'oauth'`:

```typescript
const { data, error } = await supabase
  .from("meta_connections")
  .select("*")
  .eq("law_firm_id", profile.law_firm_id)
  .eq("type", "instagram")
  .eq("source", "oauth")  // <-- novo filtro
  .maybeSingle();
```

A acao de desconectar ja usa `connection.id` para deletar, entao so vai deletar a conexao OAuth.

### 4. `supabase/functions/meta-oauth-callback/index.ts` (handleInstagramBusiness)

Incluir `source: 'oauth'` no upsert da conexao Instagram. Como o valor padrao ja e `'oauth'`, isso e apenas para ser explicito.

### 5. Facebook Integration (mesmo padrao)

Aplicar a mesma logica ao `FacebookIntegration.tsx` para consistencia, filtrando por `source = 'oauth'`.

## Resumo de alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| Migracao SQL | Adicionar coluna `source` com default `'oauth'` |
| `supabase/functions/meta-api/index.ts` | Setar `source: 'manual_test'` no `save_test_connection` |
| `src/components/settings/integrations/InstagramIntegration.tsx` | Filtrar por `source = 'oauth'` na query |
| `supabase/functions/meta-oauth-callback/index.ts` | Incluir `source: 'oauth'` explicitamente |

## Resultado esperado

1. Voce salva a conexao de teste no `/meta-test` -- fica salva com `source = 'manual_test'`
2. O card do Instagram em Integracoes continua mostrando "Conectar" (nao ve a conexao de teste)
3. Voce clica "Conectar", faz o fluxo OAuth, e ai sim mostra "Conectado" (com `source = 'oauth'`)
4. Se voce desconectar nas Integracoes, so remove a conexao OAuth, a de teste continua intacta
