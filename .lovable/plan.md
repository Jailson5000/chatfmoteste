
# Correção: Exclusão de Profissionais e Serviços na Agenda Pro

## Problema Identificado

### Erro de Foreign Key ao Excluir Profissional
```text
update or delete on table "agenda_pro_professionals" violates foreign key constraint 
"agenda_pro_appointments_professional_id_fkey" on table "agenda_pro_appointments"
```

### Causa Raiz
A tabela `agenda_pro_appointments` possui uma foreign key para `agenda_pro_professionals` com **`ON DELETE RESTRICT`**, o que impede a exclusão de profissionais que possuem agendamentos vinculados.

```text
Tabelas relacionadas a agenda_pro_professionals:
┌──────────────────────────────────────────────────────────────────────┐
│ Tabela                         │ Constraint          │ On Delete    │
├──────────────────────────────────────────────────────────────────────┤
│ agenda_pro_appointments        │ professional_id     │ RESTRICT ✗   │
│ agenda_pro_breaks              │ professional_id     │ CASCADE  ✓   │
│ agenda_pro_clients             │ preferred_prof_id   │ SET NULL ✓   │
│ agenda_pro_service_professionals│ professional_id    │ CASCADE  ✓   │
│ agenda_pro_time_off            │ professional_id     │ CASCADE  ✓   │
│ agenda_pro_working_hours       │ professional_id     │ CASCADE  ✓   │
└──────────────────────────────────────────────────────────────────────┘
```

O mesmo problema afeta serviços (`agenda_pro_services`), também com `ON DELETE RESTRICT`.

---

## Solução Proposta

### Opção A: Soft Delete (Desativar em vez de Excluir) ← Recomendada
Ao invés de excluir fisicamente, desativar o registro mantendo histórico.

**Vantagens:**
- Preserva histórico de agendamentos
- Não perde dados de relatórios
- Comportamento esperado em sistemas de agenda

**Desvantagens:**
- Registros "inativos" ficam na base

### Opção B: Verificar Agendamentos Antes de Excluir
Checar se há agendamentos pendentes/ativos antes de permitir exclusão.

**Vantagens:**
- Permite exclusão quando não há dependências ativas

**Desvantagens:**
- Não permite excluir se houver histórico

### Opção C: Alterar Constraint para SET NULL
Alterar a foreign key para `ON DELETE SET NULL`.

**Vantagens:**
- Permite exclusão mantendo agendamentos órfãos

**Desvantagens:**
- Perde referência do profissional nos relatórios

---

## Implementação Escolhida: Opção Híbrida (A + B)

### 1. Verificar se há agendamentos FUTUROS antes de excluir
Se houver agendamentos com `status` diferente de `cancelled`/`no_show`/`completed` E `start_time >= now()`:
- Impedir exclusão com mensagem clara
- Sugerir desativar ou reagendar

### 2. Se não houver agendamentos futuros ativos
- Permitir exclusão (já que só há histórico passado ou cancelados)
- Alterar constraint para `ON DELETE SET NULL` para preservar agendamentos históricos

### 3. Melhorar mensagem de erro
- Traduzir erro técnico para mensagem amigável
- Informar quantos agendamentos estão bloqueando

---

## Mudanças no Código

### Arquivo 1: `src/hooks/useAgendaProProfessionals.tsx`

**Modificar `deleteProfessional` para verificar agendamentos antes:**
```typescript
const deleteProfessional = useMutation({
  mutationFn: async (id: string) => {
    if (!lawFirm?.id) throw new Error("Empresa não encontrada");

    // Verificar se há agendamentos futuros NÃO cancelados
    const { data: futureAppointments, error: checkError } = await supabase
      .from("agenda_pro_appointments")
      .select("id, start_time, status")
      .eq("professional_id", id)
      .eq("law_firm_id", lawFirm.id)
      .gte("start_time", new Date().toISOString())
      .not("status", "in", '("cancelled","no_show","completed")')
      .limit(1);

    if (checkError) throw checkError;

    if (futureAppointments && futureAppointments.length > 0) {
      throw new Error(
        "Este profissional possui agendamentos futuros. " +
        "Cancele ou reagende os atendimentos antes de remover, " +
        "ou desative o profissional nas configurações."
      );
    }

    // Se não há agendamentos futuros, pode excluir
    const { error } = await supabase
      .from("agenda_pro_professionals")
      .delete()
      .eq("id", id)
      .eq("law_firm_id", lawFirm.id);
    
    if (error) {
      // Traduzir erro de FK para mensagem amigável
      if (error.message.includes('violates foreign key constraint')) {
        throw new Error(
          "Este profissional possui agendamentos no histórico. " +
          "Desative-o ao invés de excluir para preservar os registros."
        );
      }
      throw error;
    }
  },
  onError: (error: Error) => {
    toast({ 
      title: "Não foi possível remover", 
      description: error.message, 
      variant: "destructive" 
    });
  },
});
```

### Arquivo 2: `src/hooks/useAgendaProServices.tsx`

**Aplicar mesma lógica de verificação:**
```typescript
const deleteService = useMutation({
  mutationFn: async (id: string) => {
    if (!lawFirm?.id) throw new Error("Empresa não encontrada");

    // Verificar se há agendamentos futuros NÃO cancelados
    const { data: futureAppointments } = await supabase
      .from("agenda_pro_appointments")
      .select("id")
      .eq("service_id", id)
      .eq("law_firm_id", lawFirm.id)
      .gte("start_time", new Date().toISOString())
      .not("status", "in", '("cancelled","no_show","completed")')
      .limit(1);

    if (futureAppointments && futureAppointments.length > 0) {
      throw new Error(
        "Este serviço possui agendamentos futuros. " +
        "Cancele ou reagende os atendimentos antes de remover, " +
        "ou desative o serviço."
      );
    }

    const { error } = await supabase
      .from("agenda_pro_services")
      .delete()
      .eq("id", id)
      .eq("law_firm_id", lawFirm.id);
    
    if (error) {
      if (error.message.includes('violates foreign key constraint')) {
        throw new Error(
          "Este serviço possui agendamentos no histórico. " +
          "Desative-o para preservar os registros."
        );
      }
      throw error;
    }
  },
});
```

### Arquivo 3: Migração SQL (Opcional mas Recomendada)

**Alterar constraint para `SET NULL` em agendamentos históricos:**
```sql
-- Alterar constraint de RESTRICT para SET NULL
ALTER TABLE public.agenda_pro_appointments 
DROP CONSTRAINT agenda_pro_appointments_professional_id_fkey;

ALTER TABLE public.agenda_pro_appointments
ADD CONSTRAINT agenda_pro_appointments_professional_id_fkey 
FOREIGN KEY (professional_id) 
REFERENCES public.agenda_pro_professionals(id) 
ON DELETE SET NULL;

-- Mesma lógica para service_id
ALTER TABLE public.agenda_pro_appointments 
DROP CONSTRAINT agenda_pro_appointments_service_id_fkey;

ALTER TABLE public.agenda_pro_appointments
ADD CONSTRAINT agenda_pro_appointments_service_id_fkey 
FOREIGN KEY (service_id) 
REFERENCES public.agenda_pro_services(id) 
ON DELETE SET NULL;
```

---

## Fluxo Após Correção

```text
Usuário clica em "Remover Profissional"
                │
                ▼
   ┌─────────────────────────────┐
   │ Verificar agendamentos      │
   │ futuros NÃO cancelados      │
   └─────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
   Existem         Não existem
        │               │
        ▼               ▼
  ┌────────────┐   ┌────────────────┐
  │ Bloquear   │   │ Tentar DELETE  │
  │ com aviso  │   │ no banco       │
  │ explicativo│   └────────────────┘
  └────────────┘            │
                     ┌──────┴──────┐
                     │             │
                  Sucesso     FK Error
                     │             │
                     ▼             ▼
              ┌──────────┐  ┌──────────────┐
              │ Removido │  │ Sugerir      │
              │ com      │  │ desativar    │
              │ sucesso  │  │ ao invés de  │
              └──────────┘  │ excluir      │
                            └──────────────┘
```

---

## Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useAgendaProProfessionals.tsx` | Verificar agendamentos antes de excluir + mensagem amigável |
| `src/hooks/useAgendaProServices.tsx` | Mesma lógica de verificação para serviços |
| Migração SQL (opcional) | Alterar FK para `SET NULL` permitindo exclusão de histórico |

---

## Testes Recomendados

1. **Tentar excluir profissional COM agendamento futuro** → Deve bloquear com mensagem clara
2. **Tentar excluir profissional só com histórico** → Deve funcionar (após migração) ou sugerir desativar
3. **Desativar profissional** → Deve funcionar sem problemas
4. **Verificar relatórios** → Agendamentos antigos devem manter informação do profissional (mesmo se null)
