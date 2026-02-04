
# Plano: Melhorias PDF + Sistema de Onboarding

## Resumo das Solicitações

| # | Solicitação | Descrição |
|---|-------------|-----------|
| 1 | Remover logo do PDF | Remover o círculo branco no header do Demonstrativo (logo não carregou) |
| 2 | Sistema de Onboarding | Card de progresso no Dashboard + página dedicada `/onboarding` |
| 3 | Agendamento de Meet | Seção no topo do onboarding para agendar reunião com suporte |

---

## 1. Remover Logo do Demonstrativo PDF

**Arquivo:** `src/lib/invoiceGenerator.ts`

**Problema:** O logo em Base64 não está carregando corretamente, mostrando um círculo branco de fallback.

**Solução:** Remover completamente a tentativa de adicionar o logo e manter apenas o nome textual "MiauChat" no header. O PDF fica mais limpo e profissional.

**Alteração (linhas 56-68):**

```typescript
// ANTES:
// Logo
try {
  doc.addImage(MIAUCHAT_LOGO_BASE64, 'PNG', margin, 6, 28, 28);
} catch (e) {
  doc.setFillColor(...BRAND_COLORS.white);
  doc.circle(margin + 14, 20, 12, 'F');
}

// Nome e tagline
doc.text(COMPANY_INFO.name, margin + 35, 20);

// DEPOIS:
// Nome e tagline (sem logo)
doc.text(COMPANY_INFO.name, margin, 20);  // Ajustar posição
```

Também remover a constante `MIAUCHAT_LOGO_BASE64` que não é mais necessária.

---

## 2. Sistema de Onboarding Completo

### 2.1 Estrutura do Banco de Dados

**Nova tabela:** `onboarding_steps` (etapas do onboarding)
```sql
CREATE TABLE public.onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  youtube_id text,        -- Vídeo tutorial (opcional)
  action_label text,      -- "Preencher Dados", "Conectar WhatsApp"
  action_route text,      -- "/settings", "/connections"
  position integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Nova tabela:** `onboarding_progress` (progresso por empresa)
```sql
CREATE TABLE public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES onboarding_steps(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, step_id)
);
```

**Dados iniciais das etapas:**
| Posição | Título | Ação | Rota |
|---------|--------|------|------|
| 1 | Dados do Escritório | Preencher Dados | /settings |
| 2 | Conexão WhatsApp | Conectar | /connections |
| 3 | Configurar Agente | Criar Agente | /ai-agents |
| 4 | Testar Agente | Iniciar Teste | /conversations |
| 5 | Realizar Integração | Configurar | /settings?tab=integracoes |

### 2.2 Hook: `useOnboarding.tsx`

**Funcionalidades:**
- Buscar etapas ativas (`onboarding_steps`)
- Buscar progresso da empresa (`onboarding_progress`)
- Calcular porcentagem de conclusão
- Marcar etapa como concluída
- Verificar se onboarding está completo

```typescript
interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string | null;
  action_label: string | null;
  action_route: string | null;
  position: number;
  is_completed: boolean;  // Calculado com base no progresso
}

interface UseOnboardingReturn {
  steps: OnboardingStep[];
  progress: number;  // 0-100
  isComplete: boolean;
  isLoading: boolean;
  markComplete: (stepId: string) => Promise<void>;
}
```

### 2.3 Dashboard: Card de Progresso do Onboarding

**Arquivo:** `src/pages/Dashboard.tsx`

**Posição:** Topo do dashboard (antes dos filtros)

**Condição de exibição:** Apenas se `progress < 100` (onboarding incompleto)

**Design (conforme imagem 2):**
```text
+------------------------------------------------------------------+
| Progresso do onboarding                           [Ver guia] →   |
| [████████████████████░░░░░░░░░░░░░░░░░░] 60%     ✓ 3/5 Completo  |
+------------------------------------------------------------------+
```

**Componente:** `OnboardingProgressCard.tsx`
```tsx
interface OnboardingProgressCardProps {
  progress: number;
  completedSteps: number;
  totalSteps: number;
  onViewGuide: () => void;
}
```

### 2.4 Página de Onboarding: `/onboarding`

**Arquivo:** `src/pages/Onboarding.tsx`

**Layout (conforme imagens 3, 4 e 5):**

```text
+------------------------------------------------------------------+
|  ←  Guia de primeiros passos                    [Logo MiauChat]  |
|      Olá, [nome do usuário]! 👋                                  |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| SEUS AGENDAMENTOS (se houver link configurado)                   |
| Gerencie seus agendamentos de onboarding                         |
|                                                                  |
| +------------------------+  +------------------------+           |
| | 4 etapas essenciais   |  | Todas as 5 etapas ✨  |           |
| | Dados • WhatsApp •    |  | Parabéns! Completo   |           |
| | Agente • Testar       |  |                      |           |
| | 📅 [Ver Agendamento]  |  | 📅 [Ver Agendamento] |           |
| +------------------------+  +------------------------+           |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| 🎬 Assista antes de começar                                      |
| Veja o passo a passo completo do onboarding em poucos minutos.   |
|                                                                  |
| +----------------------------------------------------------+    |
| |  [VÍDEO EMBED - Tutorial principal do onboarding]       |    |
| +----------------------------------------------------------+    |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| ✓ 1. Tarefa: Dados do escritório                         [→]    |
|   Preencha informações básicas do escritório                     |
|   [Preencher Dados]                                              |
+------------------------------------------------------------------+
| ✓ 2. Tarefa: Conexão WhatsApp                            [→]    |
|   Conecte seu número de WhatsApp                                 |
|   [Conectar WhatsApp]                                            |
+------------------------------------------------------------------+
| ○ 3. Tarefa: Configurar Agente                           [→]    |
|   Crie seu primeiro agente de IA                                 |
|   [Criar Agente]                                                 |
+------------------------------------------------------------------+
| ... mais etapas                                                  |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| VÍDEOS RECOMENDADOS                                              |
| Assista conteúdos essenciais para potencializar seus resultados. |
|                                                                  |
| [Cards de tutoriais relacionados - da tabela tutorials]          |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| Precisa de ajuda? Acesse todos os tutoriais                      |
|                                                                  |
| [Tickets] [WhatsApp] [Labs]                                      |
+------------------------------------------------------------------+
```

### 2.5 Rota no App.tsx

```tsx
<Route
  path="/onboarding"
  element={
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  }
>
  <Route index element={<Onboarding />} />
</Route>
```

---

## 3. Seção de Agendamento de Meet

**Localização:** Topo da página de Onboarding

**Funcionalidade:**
- Sistema configurável para link de agendamento (Calendly, Google Calendar, etc.)
- Armazenar link de agendamento em `system_settings` ou similar
- Por enquanto, colocar um placeholder que o admin pode configurar depois

**Configuração futura:**
```sql
-- Adicionar em system_settings
INSERT INTO system_settings (key, value) 
VALUES ('onboarding_meeting_url', 'https://calendly.com/miauchat/onboarding');
```

**Design:**
```text
+------------------------------------------------------------------+
| SEUS AGENDAMENTOS                                                |
| Agende uma reunião com nossa equipe de suporte                   |
|                                                                  |
| +---------------------------+                                    |
| | 📅 Reunião de Onboarding |                                    |
| | Tire suas dúvidas ao vivo |                                    |
| | [Agendar Reunião] 🔗      |                                    |
| +---------------------------+                                    |
+------------------------------------------------------------------+
```

---

## Arquivos a Criar/Modificar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/lib/invoiceGenerator.ts` | Modificar | Remover logo do PDF |
| `src/hooks/useOnboarding.tsx` | Criar | Hook para gerenciar onboarding |
| `src/components/onboarding/OnboardingProgressCard.tsx` | Criar | Card de progresso para Dashboard |
| `src/components/onboarding/OnboardingStepItem.tsx` | Criar | Item de etapa expansível |
| `src/pages/Onboarding.tsx` | Criar | Página completa de onboarding |
| `src/pages/Dashboard.tsx` | Modificar | Adicionar card de progresso no topo |
| `src/App.tsx` | Modificar | Adicionar rota `/onboarding` |

---

## Migrações de Banco de Dados

### Migração 1: Tabelas de Onboarding
```sql
-- Tabela de etapas do onboarding (gerenciada pelo admin global)
CREATE TABLE public.onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  youtube_id text,
  action_label text,
  action_route text,
  position integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de progresso do onboarding por empresa
CREATE TABLE public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES onboarding_steps(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, step_id)
);

-- Índices
CREATE INDEX idx_onboarding_progress_company ON onboarding_progress(company_id);
CREATE INDEX idx_onboarding_steps_position ON onboarding_steps(position);

-- RLS
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Políticas: Etapas são públicas para leitura
CREATE POLICY "Anyone can view active steps" ON onboarding_steps
  FOR SELECT USING (is_active = true);

-- Políticas: Progresso é por empresa
CREATE POLICY "Users can view own company progress" ON onboarding_progress
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM companies c
      JOIN profiles p ON p.law_firm_id = c.law_firm_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own company progress" ON onboarding_progress
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM companies c
      JOIN profiles p ON p.law_firm_id = c.law_firm_id
      WHERE p.id = auth.uid()
    )
  );

-- Dados iniciais das etapas
INSERT INTO onboarding_steps (title, description, youtube_id, action_label, action_route, position) VALUES
  ('Dados do Escritório', 'Preencha as informações básicas do seu escritório', 'WzzqFzHKVsU', 'Preencher Dados', '/settings', 1),
  ('Conexão WhatsApp', 'Conecte seu número de WhatsApp ao sistema', 'JqdDXeAS89Q', 'Conectar WhatsApp', '/connections', 2),
  ('Configurar Agente', 'Crie e configure seu primeiro agente de IA', 'bVa-_99fZVA', 'Criar Agente', '/ai-agents', 3),
  ('Testar Agente', 'Faça um teste enviando mensagens para seu agente', NULL, 'Iniciar Teste', '/conversations', 4),
  ('Realizar Integração', 'Configure integrações adicionais (opcional)', NULL, 'Configurar', '/settings?tab=integracoes', 5);
```

### Migração 2: Campo de URL de agendamento
```sql
-- Adicionar URL de agendamento na tabela system_settings (se existir) ou criar
INSERT INTO system_settings (key, value, description)
VALUES ('onboarding_meeting_url', '', 'URL para agendamento de reunião de onboarding')
ON CONFLICT (key) DO NOTHING;
```

---

## Fluxo do Usuário

```text
1. Usuário faz login
   ↓
2. Vai para Dashboard
   ↓
3. Vê card "Progresso do onboarding" (se incompleto)
   ↓
4. Clica em "Ver guia"
   ↓
5. Navega para /onboarding
   ↓
6. (Opcional) Agenda reunião de suporte
   ↓
7. Assiste vídeo introdutório
   ↓
8. Completa cada etapa clicando nos botões de ação
   ↓
9. Sistema marca etapas como completas automaticamente (ou manual)
   ↓
10. Ao completar 100%, card some do dashboard
```

---

## Considerações de Segurança

1. **RLS habilitado** em ambas tabelas
2. **Usuários só veem/editam** progresso da própria empresa
3. **Etapas são read-only** para usuários (admin global gerencia)
4. **Sem quebra de funcionalidade** - é uma feature adicional

---

## Benefícios

1. **Onboarding guiado**: Usuários novos sabem exatamente o que fazer
2. **Redução de suporte**: Menos dúvidas sobre primeiros passos
3. **Gamificação**: Barra de progresso incentiva completar todas as etapas
4. **Reaproveitamento**: Usa tutoriais já existentes na tabela `tutorials`
5. **Configurável**: Admin pode adicionar/remover/reordenar etapas
6. **Agendamento integrado**: Facilita contato com suporte comercial/técnico
