
# Auditoria de Segurança Multi-Tenant - Resultados e Correções

## Resumo Executivo

A auditoria identificou que o sistema possui **proteções robustas** na maioria das áreas, com RLS habilitado em 100% das tabelas e validação de tenant nas Edge Functions críticas. Porém, foram identificados **3 problemas que requerem correção** para evitar vazamentos de dados.

---

## Problemas Identificados

### 1. CRÍTICO: Exposição de Email/Telefone de Profissionais (Prioridade Alta)

**Tabela:** `agenda_pro_professionals`

**Problema:** A política RLS "Public can view active professionals" permite SELECT de TODOS os campos (incluindo email, phone, document) para usuários não autenticados quando o booking público está habilitado.

**Evidência:** Query confirmou 1 profissional ativo com email e telefone preenchidos, que pode ser acessado por qualquer pessoa.

**Impacto:** Atacante pode fazer query direta ao Supabase para coletar emails/telefones dos profissionais.

**Correção Proposta:**
- Criar view segura `agenda_pro_professionals_public` que expõe apenas campos necessários
- Alterar política RLS para bloquear SELECT direto público
- Atualizar frontend para usar a nova view em páginas públicas

---

### 2. MÉDIO: Código Obsoleto - Referência Google Calendar (Prioridade Baixa)

**Arquivo:** A remoção do Google Calendar foi bem-sucedida. O código foi limpo corretamente.

**Status:** ✅ Resolvido na última modificação

---

### 3. AVISO: Leaked Password Protection Desabilitado

**Configuração:** Supabase Auth

**Problema:** A proteção contra senhas vazadas (HaveIBeenPwned) está desabilitada.

**Impacto:** Usuários podem usar senhas que já foram comprometidas em vazamentos de dados conhecidos.

**Correção:** Ação manual no painel Supabase - não requer código.

---

## Pontos Positivos Confirmados

| Área | Status | Detalhes |
|------|--------|----------|
| RLS em todas tabelas | ✅ OK | 100% das tabelas com `law_firm_id` têm RLS ativo |
| Funções SECURITY DEFINER | ✅ OK | Todas 76 funções têm `SET search_path = public` |
| Validação de tenant nas Edge Functions | ✅ OK | `delete-client`, `generate-summary`, `extract-client-facts`, `get-agent-knowledge` validam corretamente |
| Proteção IDOR | ✅ OK | Funções RPC validam `law_firm_id` antes de operações |
| Views seguras para tokens | ✅ OK | `whatsapp_instances_safe`, `google_calendar_integrations_safe` |
| Isolamento de mensagens | ✅ OK | Validação via JOIN com conversations |
| Módulo `tenant-validation.ts` | ✅ OK | Validação centralizada e bem implementada |

---

## Plano de Correção

### Fase 1: Criar View Pública Segura para Profissionais

**Arquivo a criar:** Migration SQL

```sql
-- 1. Criar view segura que expõe apenas campos necessários para booking público
CREATE OR REPLACE VIEW public.agenda_pro_professionals_public AS
SELECT 
  id,
  law_firm_id,
  name,
  specialty,
  bio,
  avatar_url,
  color,
  is_active,
  position
FROM public.agenda_pro_professionals;

-- 2. Habilitar RLS na view
ALTER VIEW public.agenda_pro_professionals_public SET (security_invoker = on);

-- 3. Criar política para acesso público controlado
CREATE POLICY "Public can view active professionals via safe view"
ON public.agenda_pro_professionals_public
FOR SELECT
USING (
  is_active = true 
  AND EXISTS (
    SELECT 1 FROM agenda_pro_settings s
    WHERE s.law_firm_id = agenda_pro_professionals_public.law_firm_id
    AND s.public_booking_enabled = true
  )
);

-- 4. Remover política pública da tabela original
DROP POLICY IF EXISTS "Public can view active professionals" ON public.agenda_pro_professionals;

-- 5. Garantir que tabela original só é acessível por usuários autenticados
CREATE POLICY "Authenticated users can view professionals"
ON public.agenda_pro_professionals
FOR SELECT
TO authenticated
USING (law_firm_id = get_user_law_firm_id(auth.uid()));
```

---

### Fase 2: Atualizar Frontend para Usar View Segura

**Arquivo:** `src/pages/PublicBooking.tsx`

Alterar linha 127:
```typescript
// ANTES
.from("agenda_pro_professionals")

// DEPOIS
.from("agenda_pro_professionals_public")
```

---

### Fase 3: Atualizar Edge Functions de Agendamento (se aplicável)

Verificar e atualizar qualquer Edge Function que busque profissionais para contexto público.

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| Nova migration SQL | Criar view segura e ajustar políticas |
| src/pages/PublicBooking.tsx | Usar `agenda_pro_professionals_public` |
| src/pages/ConfirmAppointment.tsx | Verificar se busca profissionais publicamente |

---

## Arquivos que NÃO precisam de alteração

| Arquivo | Razão |
|---------|-------|
| src/hooks/useAppointments.tsx | Já limpo do Google Calendar |
| src/components/layout/AppSidebar.tsx | Já limpo do Google Calendar |
| supabase/functions/ai-chat/index.ts | Validação de tenant correta |
| supabase/functions/generate-summary/index.ts | Validação de tenant correta |
| supabase/functions/extract-client-facts/index.ts | Validação de tenant correta |
| supabase/functions/delete-client/index.ts | Validação de tenant correta via `tenant-validation.ts` |
| supabase/functions/get-agent-knowledge/index.ts | Validação de tenant correta |

---

## Ação Manual Necessária

**Habilitar Leaked Password Protection:**
1. Acessar Cloud View → Backend
2. Ir em Auth → Settings → Password Security
3. Habilitar "Leaked Password Protection"

---

## Testes de Regressão

Após implementação, verificar:

1. **Booking Público** - Acessar `/agendar/:slug` sem login e confirmar que email/phone NÃO aparecem na resposta
2. **Painel Admin** - Acessar lista de profissionais logado e confirmar que email/phone APARECEM
3. **Página de Confirmação** - Verificar que dados sensíveis não são expostos
4. **Agenda Pro Admin** - CRUD de profissionais continua funcionando

---

## Detalhes Técnicos

### Por que usar View em vez de ajustar a política?

1. **Políticas RLS controlam acesso à linha, não à coluna** - Não é possível restringir colunas via RLS
2. **Views podem expor subset de colunas** - Solução padrão para este problema
3. **`security_invoker = on`** - Garante que a view herda as permissões do caller

### Campos a excluir da view pública:

| Campo | Razão |
|-------|-------|
| email | PII - pode ser usado para phishing |
| phone | PII - pode ser usado para spam |
| document | PII - CPF/documento sensível |
| user_id | ID interno - não necessário |
| notify_new_appointment | Configuração interna |
| notify_cancellation | Configuração interna |
| created_at | Metadado interno |
| updated_at | Metadado interno |

---

## Garantias de Não-Regressão

1. ✅ View segura herda RLS da tabela base via `security_invoker`
2. ✅ Políticas existentes para usuários autenticados não são afetadas
3. ✅ Hooks internos (`useAgendaProProfessionals`) continuam usando tabela original
4. ✅ Apenas páginas públicas usam a view
5. ✅ Edge Functions de agendamento usam service_role e não são afetadas
