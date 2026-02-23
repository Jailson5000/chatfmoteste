

## Corrigir Erro: Funcao SQL `get_global_ai_usage`

### Problema

A funcao SQL `get_global_ai_usage` no banco de dados referencia uma coluna chamada `period_start` na tabela `usage_records`, mas essa coluna nao existe. O nome real da coluna eh `billing_period` (tipo `text`).

Isso causa o erro `column "period_start" does not exist` no Postgres toda vez que o dashboard Global Admin tenta carregar metricas de uso de IA.

### Correcao

Recriar a funcao `get_global_ai_usage` substituindo todas as referencias de `period_start` por `billing_period`. Como `billing_period` eh do tipo `text` (e nao `date`), as comparacoes precisam ser ajustadas para usar cast ou formato compativel.

A coluna `billing_period` armazena valores como `2026-02` (formato YYYY-MM). Precisamos adaptar as queries para comparar por texto de periodo mensal em vez de comparacao de datas.

### Detalhes Tecnicos

**Migracao SQL a executar:**

```sql
CREATE OR REPLACE FUNCTION public.get_global_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  current_period text;
  last_period text;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  current_period := to_char(now(), 'YYYY-MM');
  last_period := to_char(now() - interval '1 month', 'YYYY-MM');

  SELECT jsonb_build_object(
    'current_month', jsonb_build_object(
      'ai_conversations', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'ai_conversation'
        AND billing_period = current_period
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'tts_minutes'
        AND billing_period = current_period
      ), 0)
    ),
    'last_month', jsonb_build_object(
      'ai_conversations', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'ai_conversation'
        AND billing_period = last_period
      ), 0),
      'tts_minutes', COALESCE((
        SELECT SUM(count) FROM usage_records
        WHERE usage_type = 'tts_minutes'
        AND billing_period = last_period
      ), 0)
    ),
    'total_companies', (SELECT COUNT(*) FROM companies WHERE status = 'active'),
    'last_webhook_cleanup', (
      SELECT value->>'ran_at' FROM system_settings WHERE key = 'last_webhook_cleanup'
    )
  ) INTO result;

  RETURN result;
END;
$$;
```

### O que muda

- `period_start >= current_month_start` vira `billing_period = current_period` (formato 'YYYY-MM')
- `period_start >= last_month_start AND period_start < current_month_start` vira `billing_period = last_period`
- Variaveis de data (`current_month_start`, `last_month_start`) substituidas por variaveis de texto (`current_period`, `last_period`)

### Sobre o warning do React

O warning "Function components cannot be given refs" no `GlobalAdminConnections` eh um aviso cosmetico do Radix UI DropdownMenu e nao causa nenhum problema funcional. Todos os `DropdownMenuTrigger` ja usam `asChild` corretamente. Este warning pode ser ignorado com seguranca.

