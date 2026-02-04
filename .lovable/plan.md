
# Plano: Melhorar Fluxo de Agendamento no Onboarding

## Problema Identificado

Quando o cliente completa todas as etapas do onboarding (100%), a seção de agendamento de reunião desaparece, não dando ao cliente a opção de agendar uma reunião com o suporte.

## Solução Proposta

### 1. Dashboard - Card de Progresso

**Comportamento Atual (MANTER):**
- Quando incompleto: Mostra barra de progresso com X/Y etapas e botão "Ver guia"
- Quando 100%: Mostra "✓ Completo" e botão "Ver guia"

**Alteração:**
- O card SEMPRE aparece, mesmo quando 100% completo
- Quando completo: mostrar versão compacta com "✓ Completo" e botão "Ver guia"

**Arquivo:** `src/components/onboarding/OnboardingProgressCard.tsx`

```text
ANTES (100%): Card some completamente
DEPOIS (100%): 
+----------------------------------------------------------+
| Progresso do onboarding                 [Ver guia] →     |
| [████████████████████████████████████████] ✓ Completo    |
+----------------------------------------------------------+
```

### 2. Página de Onboarding - Seção de Agendamento

**Alteração:**
- A seção de agendamento SEMPRE aparece (se houver URL configurada)
- Adicionar checkbox/opção: "Não desejo agendar reunião no momento"
- Se marcado, salvar no banco de dados para não perguntar novamente
- Mostrar status visual se já agendou ou optou por não agendar

**Arquivo:** `src/pages/Onboarding.tsx`

```text
+------------------------------------------------------------------+
| 📅 Seus Agendamentos                                             |
| Agende uma reunião com nossa equipe de suporte para tirar suas   |
| dúvidas ao vivo.                                                 |
|                                                                  |
| [Agendar Reunião]   [ ] Não desejo agendar no momento            |
+------------------------------------------------------------------+
```

### 3. Nova Coluna no Banco de Dados

**Tabela:** `onboarding_progress` - precisa de campo adicional OU nova tabela

**Opção mais simples - Nova entrada em `onboarding_progress`:**
- Criar uma "etapa virtual" no hook para o agendamento
- Ou adicionar coluna `meeting_scheduled` na tabela companies/law_firms

**Migração sugerida:**
```sql
ALTER TABLE public.companies 
ADD COLUMN onboarding_meeting_status text DEFAULT NULL;
-- Valores possíveis: 'scheduled', 'declined', NULL (pendente)
```

---

## Detalhes Técnicos

### Arquivo 1: `src/components/onboarding/OnboardingProgressCard.tsx`

| Linha | Alteração |
|-------|-----------|
| 21-23 | Remover o `if (progress >= 100) return null;` |
| 26-62 | Renderização condicional: versão compacta quando 100% |

**Nova lógica:**
```tsx
// Quando completo: versão compacta
if (progress >= 100) {
  return (
    <Card className="...">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="font-semibold">Progresso do onboarding</span>
          </div>
          <div className="flex items-center gap-4">
            <Progress value={100} className="w-32 h-2" />
            <span className="text-sm text-green-500 font-medium">✓ Completo</span>
            <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding")}>
              Ver guia
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Arquivo 2: `src/hooks/useOnboarding.tsx`

| Alteração | Descrição |
|-----------|-----------|
| Adicionar query | Buscar status do agendamento da empresa |
| Adicionar mutation | Para marcar que não quer agendar |
| Retornar novo campo | `meetingStatus: 'scheduled' | 'declined' | null` |

### Arquivo 3: `src/pages/Onboarding.tsx`

| Local | Alteração |
|-------|-----------|
| Seção de agendamento (linhas 70-93) | Remover condição `{meetingUrl && ...}` apenas se completo |
| Adicionar checkbox | "Não desejo agendar no momento" |
| Adicionar estado | Para controlar checkbox |
| Adicionar feedback visual | Mostrar se já optou por não agendar |

### Migração SQL

```sql
-- Adicionar status de agendamento no onboarding
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS onboarding_meeting_status text DEFAULT NULL
CHECK (onboarding_meeting_status IN ('scheduled', 'declined'));

COMMENT ON COLUMN public.companies.onboarding_meeting_status IS 
'Status do agendamento de reunião no onboarding: scheduled (agendou), declined (não quer), NULL (pendente)';
```

---

## Fluxo do Usuário

```text
1. Usuário completa todas as 5 etapas
   ↓
2. Dashboard mostra: "Progresso do onboarding" → "✓ Completo" → [Ver guia]
   ↓
3. Usuário clica em "Ver guia"
   ↓
4. Página de Onboarding mostra:
   - Todas as etapas como ✓ concluídas
   - Seção de agendamento ainda visível
   ↓
5. Usuário escolhe:
   a) Clicar em "Agendar Reunião" → Abre Agenda Pro → Sistema marca como 'scheduled'
   b) Marcar "Não desejo agendar" → Sistema marca como 'declined'
   ↓
6. Card continua visível para o cliente rever vídeos quando quiser
```

---

## Arquivos a Modificar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| Migração SQL | Criar | Adicionar coluna `onboarding_meeting_status` |
| `src/components/onboarding/OnboardingProgressCard.tsx` | Modificar | Sempre mostrar, versão compacta quando 100% |
| `src/hooks/useOnboarding.tsx` | Modificar | Adicionar lógica de status do agendamento |
| `src/pages/Onboarding.tsx` | Modificar | Sempre mostrar seção de agendamento + checkbox |

---

## Benefícios

1. **Cliente não perde oportunidade**: Agendamento sempre disponível
2. **Flexibilidade**: Cliente escolhe se quer ou não agendar
3. **Acesso permanente**: Pode rever vídeos mesmo após completar
4. **UX melhor**: Card compacto no dashboard não atrapalha após conclusão
5. **Dados úteis**: Saber quantos agendaram vs. recusaram
