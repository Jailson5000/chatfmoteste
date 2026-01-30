
# Correção: Horários de Fim de Semana no Agendamento Público

## Problema Identificado

### Causa Raiz
O agendamento público (`PublicBooking.tsx`) não considera as configurações de fim de semana (`saturday_enabled`, `sunday_enabled`) ao:
1. **Exibir dias no calendário** - Sábado e Domingo aparecem mesmo quando desabilitados nas configurações
2. **Gerar horários disponíveis** - Quando o profissional não tem horários configurados para o dia, usa fallback fixo (09:00-18:00) em vez das configurações globais

### Evidências do Banco de Dados
```
Slug "estetica":
- saturday_enabled: true (08:00-12:00)
- sunday_enabled: false

Profissional "Jails":
- Tem horários apenas para dias 1-5 (Seg-Sex)
- NÃO tem registros para dia 0 (Domingo) ou dia 6 (Sábado)
```

### Comportamento Atual vs Esperado
| Situação | Atual | Esperado |
|----------|-------|----------|
| Domingo selecionado | Mostra horários 09:00-18:00 | Dia bloqueado (sunday_enabled=false) |
| Sábado selecionado | Mostra horários 09:00-18:00 | Mostra horários 08:00-12:00 |

---

## Solução Técnica

### 1) Expandir Interface `BusinessSettings`

Adicionar campos de fim de semana que já existem no banco mas não são carregados:

```typescript
interface BusinessSettings {
  // ... campos existentes ...
  // Weekend settings
  saturday_enabled: boolean;
  saturday_start_time: string;
  saturday_end_time: string;
  sunday_enabled: boolean;
  sunday_start_time: string;
  sunday_end_time: string;
  // Default weekday hours
  default_start_time: string;
  default_end_time: string;
}
```

### 2) Carregar Configurações de Fim de Semana

Atualizar o `setSettings()` no useEffect de carregamento para incluir os novos campos:

```typescript
setSettings({
  // ... existentes ...
  saturday_enabled: settingsData.saturday_enabled ?? false,
  saturday_start_time: settingsData.saturday_start_time || "08:00",
  saturday_end_time: settingsData.saturday_end_time || "12:00",
  sunday_enabled: settingsData.sunday_enabled ?? false,
  sunday_start_time: settingsData.sunday_start_time || "08:00",
  sunday_end_time: settingsData.sunday_end_time || "12:00",
  default_start_time: settingsData.default_start_time || "08:00",
  default_end_time: settingsData.default_end_time || "18:00",
});
```

### 3) Filtrar Dias no Calendário (`getDaysToShow`)

Modificar para excluir sábados e domingos desabilitados:

```typescript
const getDaysToShow = () => {
  const days: Date[] = [];
  const maxDate = addDays(new Date(), settings?.max_advance_days || 30);
  
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    if (day <= maxDate) {
      const dayOfWeek = day.getDay();
      
      // Verificar configurações de fim de semana
      if (dayOfWeek === 0 && !settings?.sunday_enabled) continue;
      if (dayOfWeek === 6 && !settings?.saturday_enabled) continue;
      
      days.push(day);
    }
  }
  return days;
};
```

### 4) Usar Horários Corretos de Fim de Semana (`loadAvailableSlots`)

Modificar a lógica de fallback para usar configurações globais em vez de hardcoded:

```typescript
// Dentro de loadAvailableSlots()
let workingHours = null;

if (selectedProfessional) {
  const { data: hours } = await supabase
    .from("agenda_pro_working_hours")
    .select("start_time, end_time")
    .eq("professional_id", selectedProfessional.id)
    .eq("day_of_week", dayOfWeek)
    .eq("is_enabled", true)
    .single();
  
  workingHours = hours;
}

// Fallback inteligente baseado no dia da semana
if (!workingHours) {
  if (dayOfWeek === 6 && settings?.saturday_enabled) {
    // Sábado: usar horários de sábado das configurações
    workingHours = { 
      start_time: settings.saturday_start_time || "08:00", 
      end_time: settings.saturday_end_time || "12:00" 
    };
  } else if (dayOfWeek === 0 && settings?.sunday_enabled) {
    // Domingo: usar horários de domingo das configurações
    workingHours = { 
      start_time: settings.sunday_start_time || "08:00", 
      end_time: settings.sunday_end_time || "12:00" 
    };
  } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    // Dia útil: usar horários padrão
    workingHours = { 
      start_time: settings?.default_start_time || "09:00", 
      end_time: settings?.default_end_time || "18:00" 
    };
  } else {
    // Dia não habilitado - retornar sem slots
    setAvailableSlots([]);
    setLoadingSlots(false);
    return;
  }
}
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/PublicBooking.tsx` | Interface BusinessSettings, setSettings(), getDaysToShow(), loadAvailableSlots() |

---

## Validação Esperada

Após implementação:

| Cenário | Resultado |
|---------|-----------|
| Domingo desabilitado | Dia não aparece no calendário |
| Sábado habilitado (08:00-12:00) | Mostra apenas horários até 12:00 |
| Dia útil sem working_hours | Usa default_start_time/end_time |
| Profissional com working_hours | Usa horários do profissional |

---

## Garantia de Não Regressão

- Não altera tabelas do banco de dados
- Não modifica RLS/políticas
- Apenas expande leitura de campos já existentes
- Fallback mantém comportamento atual se campos forem null/undefined
- Lógica de profissionais com horários específicos continua prioritária
