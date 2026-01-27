
# Plano: Correção dos 18 Erros de Segurança

## Diagnóstico

Após análise detalhada das políticas RLS e da estrutura do banco de dados, identifiquei que **a maioria dos 18 erros são falsos positivos**. O scanner está interpretando incorretamente as políticas.

### Por que são Falsos Positivos?

| Achado do Scanner | Realidade |
|-------------------|-----------|
| "profiles publicly readable" | ❌ FALSO - Tem RLS com `get_user_law_firm_id(auth.uid())` |
| "clients publicly readable" | ❌ FALSO - Tem RLS com `auth.uid() IS NOT NULL` e `law_firm_id` check |
| "messages publicly readable" | ❌ FALSO - Tem RLS com `law_firm_id = get_user_law_firm_id(auth.uid())` |
| "conversations publicly readable" | ❌ FALSO - Tem RLS com tenant isolation |

O scanner vê `roles: {public}` nas políticas e assume que é acesso público/anônimo, mas `{public}` é o role padrão do PostgreSQL que significa "aplica-se a todos os roles" - as políticas ainda exigem `auth.uid()`.

### Problemas Reais (2 de 18)

| Problema | Tabela | Severidade |
|----------|--------|------------|
| Anon policy expõe email/phone | `agenda_pro_professionals` | Alto |
| View sem security_invoker | `company_usage_summary` | Médio (intencional) |

---

## Fase 1: Correção Real - agenda_pro_professionals

O problema: A política anon permite acesso à tabela base que contém email/phone.

**Política atual (problemática):**
```sql
"Public can view active professionals via safe view"
ON agenda_pro_professionals FOR SELECT TO anon
USING (is_active = true AND EXISTS (...public_booking_enabled...))
```

**Solução:** Remover acesso anon à tabela base, permitir apenas através da view segura.

```sql
-- Remover política anon da tabela base
DROP POLICY IF EXISTS "Public can view active professionals via safe view" 
ON public.agenda_pro_professionals;

-- Garantir que a view segura existe e está correta
CREATE OR REPLACE VIEW public.agenda_pro_professionals_public
WITH (security_invoker = on) AS
SELECT 
  id, law_firm_id, name, specialty, bio, avatar_url, color, is_active, position
  -- EXCLUI: email, phone, document, user_id, notify_*
FROM public.agenda_pro_professionals
WHERE is_active = true
  AND EXISTS (
    SELECT 1 FROM agenda_pro_settings s
    WHERE s.law_firm_id = agenda_pro_professionals.law_firm_id
    AND s.public_booking_enabled = true
  );

-- Grant acesso anon apenas à view segura
GRANT SELECT ON public.agenda_pro_professionals_public TO anon;
```

---

## Fase 2: Marcar Falsos Positivos como Ignorados

Usar a ferramenta `manage_security_finding` para marcar os falsos positivos:

### Tabelas com RLS Correto (Falsos Positivos)

| internal_id | Motivo para Ignorar |
|-------------|---------------------|
| profiles_table_public_exposure | RLS com `law_firm_id = get_user_law_firm_id(auth.uid())` |
| knowledge_items_content_exposure | RLS com tenant isolation |
| google_calendar_events_exposure | RLS com `law_firm_id` check |
| cases_legal_exposure | RLS com `law_firm_id` check |
| documents_file_exposure | RLS via clients/cases FK |
| whatsapp_instances_config_exposure | RLS + view segura ocultando api_key |
| internal_tasks_exposure | RLS com `law_firm_id` check |
| support_tickets_exposure | RLS com `law_firm_id` check |
| clients_table_public_exposure | RLS com triple auth check |
| templates_message_exposure | RLS com `law_firm_id` check |
| agenda_pro_appointments_public_exposure | RLS com tenant isolation |
| agenda_pro_clients_public_exposure | RLS com tenant isolation |
| messages_content_exposure | RLS com `law_firm_id` (novo!) |
| automations_webhook_exposure | RLS com `law_firm_id` check |
| conversations_metadata_exposure | RLS com tenant isolation |

### View Intencional (Ignorar com Justificativa)

| internal_id | Motivo |
|-------------|--------|
| SUPA_security_definer_view | `company_usage_summary` precisa agregar dados cross-tenant para dashboard admin global |

---

## Fase 3: Atualização do Frontend (Já Feita)

O `PublicBooking.tsx` já usa a view segura `agenda_pro_professionals_public`, então não precisa de alteração.

---

## Resumo de Ações

| Ação | Tipo | Impacto |
|------|------|---------|
| Remover anon policy da tabela base | Migration SQL | Bloqueia acesso direto a PII |
| Grant SELECT à view pública | Migration SQL | Mantém funcionalidade de booking |
| Marcar 16 falsos positivos | manage_security_finding | Remove ruído do scanner |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| Nova migração SQL | Corrigir política anon do agenda_pro_professionals |
| (Nenhum arquivo de código) | A view segura já existe e já é usada |

---

## Resultado Esperado

- **18 Erros** → **0 Erros** (16 ignorados, 1 corrigido, 1 já ignorado)
- PII de profissionais protegido
- Funcionalidade de booking público mantida
- Scanner limpo sem falsos positivos
