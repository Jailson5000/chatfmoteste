
# Limpeza de Banco + Correcao de Bug: get_global_ai_usage

## Resumo

3 acoes de banco de dados, sendo 1 correcao de bug ativo e 2 limpezas de manutencao. Nenhum arquivo frontend alterado.

---

## 1. CORRECAO DE BUG: Funcao `get_global_ai_usage` (CRITICO)

**O problema**: A funcao RPC `get_global_ai_usage` referencia a coluna `quantity` na tabela `usage_records`, mas essa coluna nao existe. O nome real e `count`. Isso gera erros `column "quantity" does not exist` toda vez que voce acessa o painel Global Admin (rota `/global-admin`).

**Impacto atual**: Os dados de uso de IA (conversas IA e minutos TTS) no dashboard de infraestrutura estao completamente quebrados -- mostram erro ou zero.

**Correcao**: Recriar a funcao substituindo `SUM(quantity)` por `SUM(count)` em 4 ocorrencias.

**Risco**: Zero. Apenas corrige uma funcao que ja esta falhando.

---

## 2. LIMPEZA: webhook_logs - Reduzir retencao de 3 dias para 1 dia

**Situacao atual**: 174.499 registros ocupando **170 MB** (33% do banco). A funcao `cleanup_old_webhook_logs` atualmente limpa logs com mais de 3 dias.

**Acao**: Atualizar a funcao para limpar logs com mais de **1 dia** e executar a limpeza imediatamente.

**Economia estimada**: ~110 MB liberados imediatamente.

**Risco**: Zero. Logs de webhook sao apenas para debug temporario. O cron existente (`cleanup-webhook-logs-daily` as 03h) continuara rodando com a nova retencao.

---

## 3. LIMPEZA: instance_status_history + ai_processing_queue

**instance_status_history**: 46.558 registros desde dezembro/2025, ocupando 9 MB. Manter apenas os ultimos 30 dias.

**ai_processing_queue**: 2.057 registros `completed` que nao servem mais. Limpar todos com mais de 24h.

**Risco**: Zero. Dados historicos antigos e tarefas ja concluidas.

---

## Implementacao (SQL apenas)

### Migration 1: Corrigir get_global_ai_usage
```sql
CREATE OR REPLACE FUNCTION public.get_global_ai_usage()
-- Trocar SUM(quantity) por SUM(count) em 4 lugares
```

### Migration 2: Atualizar cleanup_old_webhook_logs
```sql
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_logs()
-- Trocar interval '3 days' por interval '1 day'
```

### Execucao imediata (via SQL):
```sql
DELETE FROM webhook_logs WHERE created_at < now() - interval '1 day';
DELETE FROM instance_status_history WHERE changed_at < now() - interval '30 days';
DELETE FROM ai_processing_queue WHERE status = 'completed' AND created_at < now() - interval '1 day';
```

---

## Impacto total

| Acao | Espaco liberado | Risco |
|------|----------------|-------|
| Corrigir get_global_ai_usage | 0 (corrige bug) | Zero |
| webhook_logs 1 dia | ~110 MB | Zero |
| instance_status_history 30d | ~7 MB | Zero |
| ai_processing_queue cleanup | ~1 MB | Zero |
| **Total** | **~118 MB** | **Zero** |

Apos as limpezas o banco passara de **518 MB para ~400 MB** (5% do limite de 8GB).

Nenhum arquivo frontend sera alterado. Nenhuma funcionalidade sera afetada.
