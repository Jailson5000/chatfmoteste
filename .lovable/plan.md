

# Análise: Job de Limpeza de webhook_logs

## Situação Atual

### Métricas da Tabela
| Métrica | Valor |
|---------|-------|
| **Tamanho Total** | 93 MB (29% do banco de dados) |
| **Total de Registros** | 88.740 logs |
| **Últimos 7 dias** | 39.940 logs (45%) |
| **Últimos 30 dias** | 88.698 logs (99.9%) |
| **Log mais antigo** | 05/01/2026 |
| **Log mais recente** | 04/02/2026 |

### Volume Diário
```text
Dia             | Logs    | Erros
----------------|---------|-------
04/02 (hoje)    | 6.955   | 0
03/02           | 10.907  | 0
02/02           | 10.246  | 0
01/02           | 2.526   | 0
...média        | ~5.500  | 0
```

### Distribuição por Tipo
| Direção | Quantidade | Erros | Últimos 7 dias |
|---------|------------|-------|----------------|
| incoming | 88.398 | 0 | 39.868 |
| internal | 336 | 0 | 72 |
| outgoing | 6 | 6 | 0 |

---

## Para Que Serve a Tabela

### Uso Principal
A tabela `webhook_logs` é usada para **auditoria e debug** de:

1. **Webhooks recebidos** do Evolution API (mensagens WhatsApp)
2. **Processamento de IA** (respostas do agente)
3. **Sincronização com N8N** (prompts)

### Onde é Lida
| Local | Propósito | Período Necessário |
|-------|-----------|-------------------|
| `GlobalAdminConnections.tsx` | Visualizar últimos 50 logs por instância | Últimos dias |
| Edge Functions | Apenas escrita, não leitura | N/A |

---

## Impacto da Limpeza

### Zero Risco de Quebra
A limpeza de logs antigos **NÃO quebra nenhuma funcionalidade** porque:

1. **Logs são apenas para auditoria** - não afetam o funcionamento do sistema
2. **Única leitura usa LIMIT 50** - só mostra os logs mais recentes
3. **Nenhum relatório depende de histórico** - não há dashboards de longo prazo
4. **Não há foreign keys críticas** - automation_id é opcional

### Benefícios
| Benefício | Impacto |
|-----------|---------|
| **Redução de 45-55 MB** | Libera ~30% do espaço do banco |
| **Queries mais rápidas** | Menos registros para varrer |
| **Backups menores** | Restauração mais rápida |
| **Custo de storage** | Menor no longo prazo |

---

## Proposta de Implementação

### Opção 1: Cron Job com pg_cron (Recomendado)

```sql
-- Criar função de limpeza
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM webhook_logs
  WHERE created_at < now() - interval '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log opcional da limpeza
  INSERT INTO system_settings (key, value, updated_at)
  VALUES (
    'last_webhook_cleanup',
    jsonb_build_object(
      'deleted', deleted_count,
      'ran_at', now()
    ),
    now()
  )
  ON CONFLICT (key) DO UPDATE 
  SET value = EXCLUDED.value, updated_at = now();
  
  RETURN deleted_count;
END;
$$;

-- Agendar execução diária às 3h da manhã
SELECT cron.schedule(
  'cleanup-webhook-logs-daily',
  '0 3 * * *',
  'SELECT cleanup_old_webhook_logs()'
);
```

### Opção 2: Edge Function com Cron

```typescript
// supabase/functions/cleanup-webhook-logs/index.ts
serve(async (req) => {
  const supabase = createClient(url, serviceKey);
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { count, error } = await supabase
    .from('webhook_logs')
    .delete()
    .lt('created_at', sevenDaysAgo.toISOString())
    .select('*', { count: 'exact', head: true });
  
  return new Response(JSON.stringify({ deleted: count }));
});
```

---

## Comparação das Opções

| Aspecto | pg_cron (SQL) | Edge Function |
|---------|---------------|---------------|
| **Performance** | ⭐⭐⭐ Mais rápido | ⭐⭐ Boa |
| **Manutenção** | ⭐⭐⭐ Menos código | ⭐⭐ Mais código |
| **Monitoramento** | ⭐⭐ Via SQL | ⭐⭐⭐ Via dashboard |
| **Custo** | ⭐⭐⭐ Zero | ⭐⭐ Consumo de função |
| **Recomendado** | ✅ Sim | Para casos especiais |

---

## Estimativa de Economia

### Se implementar retenção de 7 dias:
```text
Hoje:          93 MB (88.740 logs)
Após limpeza:  ~45 MB (~40.000 logs)
Economia:      ~48 MB (52% de redução)
```

### Se implementar retenção de 30 dias:
```text
Hoje:          93 MB (88.740 logs)
Após limpeza:  ~93 MB (quase tudo é dos últimos 30 dias)
Economia:      Mínima agora, mas evita crescimento futuro
```

---

## Recomendação Final

**Implementar retenção de 7 dias** porque:

1. ✅ Logs antigos não são consultados
2. ✅ 7 dias é tempo suficiente para debug
3. ✅ Economia imediata de ~50 MB
4. ✅ Previne crescimento descontrolado
5. ✅ Zero impacto em funcionalidades

---

## Plano de Segurança

### Antes de Implementar
1. Fazer backup da tabela (opcional, logs não são críticos)
2. Validar que não há queries dependendo de histórico longo

### Rollback se Necessário
```sql
-- Desabilitar o cron job
SELECT cron.unschedule('cleanup-webhook-logs-daily');

-- Ou deletar a função
DROP FUNCTION IF EXISTS cleanup_old_webhook_logs();
```

### Monitoramento
- Verificar `system_settings` para ver última execução
- Acompanhar tamanho da tabela após algumas execuções

---

## Próximos Passos

Aprovar para implementar:
1. Criar função `cleanup_old_webhook_logs()`
2. Agendar cron job para execução diária
3. Executar primeira limpeza manual para ver resultado

