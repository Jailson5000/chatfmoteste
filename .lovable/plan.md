

# Escolher Instância WhatsApp para Envio na Agenda Pro

## Situação Atual

Confirmei: tanto `agenda-pro-notification` quanto `process-scheduled-messages` pegam a **primeira instância conectada** da empresa:

```typescript
// agenda-pro-notification (linha 372-378)
.from("whatsapp_instances")
.eq("law_firm_id", appointment.law_firm_id)
.eq("status", "connected")
.limit(1)
.maybeSingle();

// process-scheduled-messages (linha 170-175) - mesmo padrão
```

Não existe coluna `whatsapp_instance_id` na tabela `agenda_pro_settings`. Se a empresa tem 2+ instâncias, o sistema escolhe uma arbitrariamente.

---

## Plano de Correção

### 1. Migração: Adicionar coluna na tabela `agenda_pro_settings`

```sql
ALTER TABLE agenda_pro_settings 
ADD COLUMN whatsapp_instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE SET NULL;
```

### 2. Backend: `agenda-pro-notification/index.ts`

Alterar a query de instância (linha 372-378) para:

- Primeiro buscar `whatsapp_instance_id` do `agenda_pro_settings` da empresa
- Se configurado, usar essa instância específica (validando que está `connected`)
- Se não configurado ou a instância configurada estiver offline, fallback para a primeira conectada (comportamento atual)

### 3. Backend: `process-scheduled-messages/index.ts`

Mesmo ajuste na query de instância (linha 170-175):

- Buscar `whatsapp_instance_id` do `agenda_pro_settings` antes de pegar qualquer instância
- Fallback para primeira conectada se não configurado

### 4. Frontend: `AgendaProSettings.tsx`

Na seção "Notificações e Lembretes", adicionar um seletor de instância WhatsApp **antes** dos switches de WhatsApp/Email:

- Select com lista de instâncias da empresa (nome + número de telefone)
- Opção padrão: "Automático (primeira disponível)"
- Só aparece se `send_whatsapp_confirmation` está ativo
- Usa `useWhatsAppInstances` para listar instâncias conectadas

### 5. Hook: `useAgendaPro.tsx`

- Adicionar `whatsapp_instance_id` na interface `AgendaProSettings`
- Incluir o campo no `select` e no `update`

---

## Resumo de Arquivos

| Arquivo | Mudança |
|---|---|
| `agenda_pro_settings` (migração) | Adicionar coluna `whatsapp_instance_id` |
| `supabase/functions/agenda-pro-notification/index.ts` | Usar instância configurada com fallback |
| `supabase/functions/process-scheduled-messages/index.ts` | Usar instância configurada com fallback |
| `src/components/agenda-pro/AgendaProSettings.tsx` | Adicionar seletor de instância WhatsApp |
| `src/hooks/useAgendaPro.tsx` | Incluir `whatsapp_instance_id` no tipo e queries |

