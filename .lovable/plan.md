
# Plano: Dashboard de Monitoramento + Alertas + Exportação PDF de Empresas

## Resumo das 3 Funcionalidades

### 1. Dashboard de Monitoramento de Uso (Banco, Storage, IA)
Adicionar seção no painel admin global mostrando métricas de infraestrutura em tempo real.

### 2. Alertas Automáticos de Capacidade (70% do limite)
Sistema que verifica periodicamente o uso e notifica o admin quando atingir thresholds críticos.

### 3. Botão de Exportação PDF de Empresas
PDF profissional com todas as empresas cadastradas e seus dados fiscais/operacionais.

---

## Arquitetura Técnica

### Dados Disponíveis no Sistema

| Métrica | Query Atual | Limite Supabase Pro |
|---------|-------------|---------------------|
| **Banco de dados** | `pg_database_size()` → 316 MB | 8 GB |
| **Storage** | `SUM(metadata->>'size')` → 17.7 MB | 100 GB |
| **Conversas IA/mês** | `usage_records` → por tenant | Por plano |
| **TTS minutos** | `usage_records` → por tenant | Por plano |
| **Webhook logs** | Tabela já tem cleanup automático | - |

### Cálculo de Thresholds

```text
Banco de Dados:
- 70% de 8 GB = 5.6 GB → Alerta WARNING
- 85% de 8 GB = 6.8 GB → Alerta CRITICAL

Storage:
- 70% de 100 GB = 70 GB → Alerta WARNING
- 85% de 100 GB = 85 GB → Alerta CRITICAL
```

---

## Implementação Detalhada

### Parte 1: Hook de Métricas de Infraestrutura

**Novo arquivo: `src/hooks/useInfrastructureMetrics.tsx`**

```typescript
// Hook que consulta métricas de infraestrutura
// - Tamanho do banco de dados via RPC
// - Tamanho do storage via consulta storage.objects
// - Uso de IA agregado de todas as empresas
// - Cálculo de percentuais e status de alerta
```

**Funcionalidades:**
- Consulta `pg_database_size()` via RPC seguro
- Consulta storage.objects para calcular uso total
- Agrega uso de IA de todas as empresas
- Calcula percentuais e status (ok/warning/critical)
- Polling a cada 5 minutos

---

### Parte 2: Componente de Monitoramento no Dashboard

**Modificar: `src/pages/global-admin/GlobalAdminDashboard.tsx`**

Nova seção "Monitoramento de Infraestrutura" com:

1. **Card: Banco de Dados**
   - Barra de progresso com cores (verde/amarelo/vermelho)
   - Valor atual e limite (ex: "316 MB / 8 GB")
   - Percentual de uso
   - Ícone de alerta se > 70%

2. **Card: Storage**
   - Barra de progresso com cores
   - Valor atual e limite
   - Breakdown por bucket (logos, chat-media, etc.)

3. **Card: Uso IA Global**
   - Total de conversas IA no mês
   - Total de minutos TTS no mês
   - Comparativo com mês anterior

4. **Card: Status do Sistema**
   - Último cleanup de webhook_logs
   - Conexões Realtime ativas
   - Edge Functions (status)

---

### Parte 3: Sistema de Alertas Automáticos

**Estratégia: Edge Function + Cron Job**

**Novo arquivo: `supabase/functions/check-infrastructure-alerts/index.ts`**

```typescript
// Edge Function que:
// 1. Consulta tamanho do banco via SQL direto
// 2. Consulta tamanho do storage
// 3. Compara com thresholds (70%, 85%)
// 4. Se threshold atingido, cria notificação em `notifications`
// 5. Evita spam: só notifica 1x por dia por tipo de alerta
```

**Cron Job (via pg_cron):**
```sql
-- Executar a cada 6 horas
SELECT cron.schedule(
  'check-infrastructure-alerts',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://jiragtersejnarxruqyd.supabase.co/functions/v1/check-infrastructure-alerts',
    headers:='{"Authorization": "Bearer <service_key>"}'::jsonb
  );
  $$
);
```

**Notificações criadas:**
- Tipo: `INFRASTRUCTURE_WARNING` ou `INFRASTRUCTURE_CRITICAL`
- Aparece no painel admin global
- Inclui métricas atuais e recomendações

---

### Parte 4: PDF de Empresas

**Novo arquivo: `src/lib/companyReportGenerator.ts`**

PDF profissional com:

**Cabeçalho:**
- Logo MiauChat
- Título: "Relatório de Empresas Cadastradas"
- Data de geração

**Tabela de Empresas:**
| Coluna | Origem |
|--------|--------|
| Nome | `companies.name` |
| CPF/CNPJ | `companies.document` |
| Plano | `plans.name` |
| Status | `companies.status` + `approval_status` |
| Ativa? | Sim/Não baseado em status |
| Data Ativação | `companies.approved_at` |
| Trial | Dias restantes ou "Expirado" |
| Faturas em Aberto | Via `list-stripe-invoices` (status=open) |

**Rodapé:**
- Total de empresas
- Data/hora de geração
- "MiauChat - Relatório Confidencial"

**Modificar: `src/pages/global-admin/GlobalAdminCompanies.tsx`**

Adicionar botão "Exportar Relatório PDF" no header que:
1. Busca todas as empresas
2. Para cada empresa com Stripe, consulta faturas pendentes
3. Gera PDF formatado
4. Faz download automático

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/hooks/useInfrastructureMetrics.tsx` | **Criar** | Hook para métricas de infra |
| `src/components/global-admin/InfrastructureMonitor.tsx` | **Criar** | Componente visual do dashboard |
| `src/lib/companyReportGenerator.ts` | **Criar** | Gerador de PDF de empresas |
| `src/pages/global-admin/GlobalAdminDashboard.tsx` | **Modificar** | Adicionar seção de monitoramento |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | **Modificar** | Adicionar botão PDF |
| `supabase/functions/check-infrastructure-alerts/index.ts` | **Criar** | Edge function de alertas |
| `supabase/functions/get-infrastructure-metrics/index.ts` | **Criar** | Edge function para métricas |
| Migração SQL | **Criar** | RPC para consultar tamanho do banco |

---

## Migração SQL Necessária

```sql
-- 1. Função RPC segura para consultar tamanho do banco (apenas admin global)
CREATE OR REPLACE FUNCTION get_database_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Validar que é admin global
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT jsonb_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'database_size_pretty', pg_size_pretty(pg_database_size(current_database())),
    'database_limit_bytes', 8589934592, -- 8 GB
    'database_limit_pretty', '8 GB',
    'percent_used', ROUND((pg_database_size(current_database())::numeric / 8589934592) * 100, 2)
  ) INTO result;

  RETURN result;
END;
$$;

-- 2. Função RPC para consultar tamanho do storage
CREATE OR REPLACE FUNCTION get_storage_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  total_bytes bigint;
BEGIN
  -- Validar que é admin global
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  INTO total_bytes
  FROM storage.objects;

  SELECT jsonb_build_object(
    'storage_size_bytes', total_bytes,
    'storage_size_pretty', pg_size_pretty(total_bytes),
    'storage_limit_bytes', 107374182400, -- 100 GB
    'storage_limit_pretty', '100 GB',
    'percent_used', ROUND((total_bytes::numeric / 107374182400) * 100, 2),
    'buckets', (
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket_id,
        'size_bytes', bucket_size,
        'size_pretty', pg_size_pretty(bucket_size),
        'file_count', file_count
      ))
      FROM (
        SELECT 
          bucket_id,
          COALESCE(SUM((metadata->>'size')::bigint), 0) as bucket_size,
          COUNT(*) as file_count
        FROM storage.objects
        GROUP BY bucket_id
      ) buckets
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 3. Tabela para tracking de alertas enviados (evita spam)
CREATE TABLE IF NOT EXISTS infrastructure_alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  threshold_level text NOT NULL, -- 'warning' ou 'critical'
  metric_value numeric,
  metric_limit numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(alert_type, threshold_level, (created_at::date))
);

-- RLS
ALTER TABLE infrastructure_alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage alerts"
ON infrastructure_alert_history
FOR ALL
TO authenticated
USING (is_admin(auth.uid()));
```

---

## Fluxo do Usuário

### Dashboard de Monitoramento
1. Admin global acessa `/global-admin`
2. Nova seção "Infraestrutura" mostra métricas
3. Cards com barras de progresso coloridas
4. Se houver alerta, badge vermelho pisca

### Alertas Automáticos
1. Cron job executa a cada 6 horas
2. Verifica thresholds de banco e storage
3. Se > 70%, cria notificação no sistema
4. Admin vê badge no ícone de notificações
5. Clica e vê "Banco de dados atingiu 75% (6 GB)"

### Exportação PDF de Empresas
1. Admin vai em "Empresas" → clica "Exportar PDF"
2. Sistema busca todos os dados + faturas Stripe
3. Gera PDF profissional
4. Download automático: `empresas-miauchat-2026-02-04.pdf`

---

## Segurança

- Funções RPC com `SECURITY DEFINER` e validação `is_admin()`
- Edge functions verificam token JWT
- Dados sensíveis (faturas) só via APIs autorizadas
- PDF não salvo em servidor, gerado no cliente

---

## Testes Recomendados

1. Verificar se métricas aparecem corretamente no dashboard
2. Testar export PDF com empresas que têm/não têm faturas Stripe
3. Simular alerta: temporariamente reduzir threshold para 5%
4. Verificar que notificações não são duplicadas

---

## Estimativa de Impacto

| Aspecto | Impacto |
|---------|---------|
| **Performance** | Mínimo - queries leves, cache 5 min |
| **Segurança** | Zero risco - funções protegidas por RLS |
| **UX** | Positivo - visibilidade total do sistema |
| **Manutenção** | Baixa - alertas automáticos |
