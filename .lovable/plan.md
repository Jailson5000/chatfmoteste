
# Plano: Limpeza Automatica de webhook_logs

## Resumo

Implementar um cron job que executa diariamente as 3h da manha para remover registros da tabela `webhook_logs` com mais de 30 dias, otimizando performance do banco de dados.

---

## Analise da Situacao Atual

| Metrica | Valor |
|---------|-------|
| Total de registros | 47.374 |
| Registros > 30 dias | 577 |
| Tamanho da tabela | 50 MB |
| Cron jobs existentes | 8 |

---

## Garantia de Seguranca dos Dados

A tabela `webhook_logs` contem APENAS dados tecnicos de debug:

| Coluna | Tipo | Conteudo |
|--------|------|----------|
| id | uuid | Identificador do log |
| automation_id | uuid | Referencia a automacao |
| direction | text | Direcao (in/out) |
| payload | jsonb | Payload do webhook |
| response | jsonb | Resposta recebida |
| status_code | integer | Codigo HTTP |
| error_message | text | Mensagem de erro |
| created_at | timestamp | Data de criacao |

**NAO AFETA:**
- Mensagens de clientes (tabela `messages`)
- Conversas (tabela `conversations`)
- Dados de clientes (tabela `clients`)
- Agendamentos (tabelas `appointments`, `agenda_pro_*`)
- Qualquer dado de negocio

---

## Implementacao

### Opcao 1: SQL Direto via pg_cron (Recomendada)

Criar um cron job que executa DELETE diretamente no PostgreSQL:

```sql
SELECT cron.schedule(
  'cleanup-webhook-logs-daily',
  '0 3 * * *',  -- 3h da manha, todos os dias
  $$
  DELETE FROM public.webhook_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
```

**Vantagens:**
- Execucao local no banco (sem overhead de Edge Function)
- Mais eficiente para operacoes de limpeza
- Padrao ja usado em outros sistemas

### Opcao 2: Edge Function (Alternativa)

Criar uma Edge Function `cleanup-webhook-logs` chamada via cron job.

**Desvantagens:**
- Overhead de HTTP request
- Mais complexo sem necessidade

---

## Sequencia de Implementacao

| Etapa | Descricao | Complexidade |
|-------|-----------|--------------|
| 1 | Criar indice em `created_at` (se nao existir) | Baixa |
| 2 | Registrar cron job no pg_cron | Baixa |
| 3 | Testar execucao manual | Baixa |
| 4 | Monitorar via `cron.job_run_details` | Baixa |

---

## Migracao SQL

```sql
-- Garantir indice para otimizar DELETE
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at 
ON public.webhook_logs(created_at);

-- Registrar cron job para limpeza diaria as 3h
SELECT cron.schedule(
  'cleanup-webhook-logs-daily',
  '0 3 * * *',
  $$
  DELETE FROM public.webhook_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
```

---

## Monitoramento

Apos implementacao, verificar execucao:

```sql
-- Ver ultimas execucoes
SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-webhook-logs-daily')
ORDER BY start_time DESC
LIMIT 10;
```

---

## Impacto Esperado

| Antes | Depois (30 dias) |
|-------|------------------|
| 47.374 registros | ~46.800 registros |
| 50 MB | ~48 MB |
| Crescimento ilimitado | Maximo ~30 dias de dados |

**Estimativa de economia mensal:** ~1.5 MB/mes de dados removidos automaticamente, evitando acumulo excessivo.

---

## Garantia de Nao-Regressao

1. **Tabela isolada**: `webhook_logs` nao tem FKs para outras tabelas
2. **Dados tecnicos**: Apenas logs de debug, nao dados de negocio
3. **Cron independente**: Novo job nao interfere nos 8 existentes
4. **Horario off-peak**: Execucao as 3h minimiza impacto
