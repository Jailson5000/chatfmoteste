

# Plano: Corrigir Acesso à URL de Agendamento para Clientes Normais

## Diagnóstico

### Problema Confirmado
O cliente `miautest02@gmail.com` **não consegue ver** a seção "Seus Agendamentos" porque:

1. **Política RLS atual** em `system_settings` permite leitura pública apenas para:
   - `payment_provider`
   - `payments_disabled`
   - `manual_registration_enabled`

2. O `onboarding_meeting_url` **não está incluído** nessa lista

3. Os clientes que funcionam (Jailson e Suporte) são **super_admin** na `admin_user_roles`, então conseguem ler TODAS as configurações através da política `is_admin()`

### Por que os outros clientes veem
| Cliente | Está em admin_user_roles? | Pode ler onboarding_meeting_url? |
|---------|---------------------------|----------------------------------|
| Jailson | Sim (super_admin) | Sim - via is_admin() |
| Suporte MiauChat | Sim (super_admin) | Sim - via is_admin() |
| miautest02@gmail.com | Não | Não - RLS bloqueia |

---

## Solução

### Atualizar Política RLS em system_settings

Adicionar `onboarding_meeting_url` à lista de keys que podem ser lidas publicamente.

**Migração SQL:**
```sql
-- Drop existing policy
DROP POLICY IF EXISTS "Allow public read for payment and registration settings" ON system_settings;

-- Create updated policy including onboarding_meeting_url
CREATE POLICY "Allow public read for public settings"
  ON system_settings FOR SELECT
  USING (
    key IN (
      'payment_provider', 
      'payments_disabled', 
      'manual_registration_enabled',
      'onboarding_meeting_url'
    )
  );
```

---

## Detalhes Técnicos

| Item | Valor |
|------|-------|
| Tabela | `public.system_settings` |
| Política removida | `Allow public read for payment and registration settings` |
| Nova política | `Allow public read for public settings` |
| Key adicionada | `onboarding_meeting_url` |

---

## Por que é Seguro

- A URL de agendamento é informação **pública** (como Calendly/Cal.com)
- Não contém dados sensíveis
- Apenas adiciona uma key específica à lista de leitura pública
- Todas as outras configurações do sistema continuam protegidas

---

## Fluxo Após Correção

```text
1. Cliente miautest02@gmail.com abre /onboarding
   ↓
2. Hook useOnboarding busca meetingUrl de system_settings
   ↓
3. RLS PERMITE leitura (onboarding_meeting_url na lista pública)
   ↓
4. meetingUrl retorna "https://suporte.miauchat.com.br/agendar/reuniao"
   ↓
5. Condição {meetingUrl && ...} é TRUE
   ↓
6. Seção "Seus Agendamentos" aparece normalmente
```

---

## Arquivo a Criar

| Tipo | Descrição |
|------|-----------|
| Migração SQL | Atualizar política RLS para incluir `onboarding_meeting_url` |

---

## Resultado Esperado

| Cliente | Antes | Depois |
|---------|-------|--------|
| Super admins (Jailson, Suporte) | Vê agendamento | Vê agendamento (sem mudança) |
| Clientes normais (miautest02) | Não vê agendamento | Vê agendamento normalmente |

