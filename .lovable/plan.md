
# Plano: Gerenciamento de Onboarding no Global Admin

## Resumo

Criar uma página de gerenciamento de etapas do onboarding no painel do Admin Global, localizada abaixo de Tutoriais no menu lateral, seguindo o mesmo padrão visual e funcional da página `GlobalAdminTutorials.tsx`.

---

## Estrutura Atual

### Tabela `onboarding_steps`
```
| id | title | description | youtube_id | action_label | action_route | position | is_active |
```

### Dados atuais (5 etapas):
| Pos | Título | Rota | YouTube ID |
|-----|--------|------|------------|
| 1 | Dados do Escritório | /settings | WzzqFzHKVsU |
| 2 | Conexão WhatsApp | /connections | JqdDXeAS89Q |
| 3 | Configurar Agente | /ai-agents | bVa-_99fZVA |
| 4 | Testar Agente | /conversations | - |
| 5 | Realizar Integração | /settings?tab=integracoes | - |

---

## Arquivos a Criar/Modificar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/pages/global-admin/GlobalAdminOnboarding.tsx` | Criar | Página de gerenciamento de etapas |
| `src/hooks/useOnboardingAdmin.tsx` | Criar | Hook para CRUD de etapas (admin) |
| `src/pages/global-admin/index.ts` | Modificar | Exportar nova página |
| `src/components/layout/GlobalAdminLayout.tsx` | Modificar | Adicionar item no menu lateral |
| `src/App.tsx` | Modificar | Adicionar rota |

---

## Detalhes de Implementação

### 1. Hook `useOnboardingAdmin.tsx`

Funcionalidades CRUD para etapas do onboarding (separado do hook de cliente):

```typescript
interface OnboardingStepInsert {
  title: string;
  description?: string;
  youtube_id?: string;
  action_label?: string;
  action_route?: string;
  position: number;
  is_active: boolean;
}

// Queries
- fetchSteps: Lista todas as etapas (incluindo inativas)
- fetchMeetingUrl: Busca URL de agendamento

// Mutations
- createStep: Cria nova etapa
- updateStep: Atualiza etapa existente
- deleteStep: Remove etapa
- updateMeetingUrl: Atualiza URL de agendamento
```

### 2. Página `GlobalAdminOnboarding.tsx`

Interface seguindo o padrão de `GlobalAdminTutorials`:

```text
+------------------------------------------------------------------+
| Gerenciar Onboarding                          [Nova Etapa]       |
| Configure as etapas do guia de primeiros passos                  |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| URL de Agendamento                                               |
| Link para agendamento de reunião de onboarding                   |
| [______________________________] [Salvar]                        |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| Etapas do Onboarding (5)                                         |
|------------------------------------------------------------------|
| # | Título            | Rota         | YouTube | Status | Ações  |
|---|-------------------|--------------|---------|--------|--------|
| 1 | Dados Escritório  | /settings    | ✓       | 👁️     | ✏️ 🗑️ |
| 2 | Conexão WhatsApp  | /connections | ✓       | 👁️     | ✏️ 🗑️ |
| 3 | Configurar Agente | /ai-agents   | ✓       | 👁️     | ✏️ 🗑️ |
| 4 | Testar Agente     | /conversations| -      | 👁️     | ✏️ 🗑️ |
| 5 | Realizar Integração| /settings?..| -      | 👁️     | ✏️ 🗑️ |
+------------------------------------------------------------------+
```

#### Formulário de Etapa (Dialog)

Campos:
- Título (obrigatório)
- Descrição
- ID do YouTube (opcional - para vídeo tutorial)
- Label do botão de ação (ex: "Preencher Dados")
- Rota da ação (ex: "/settings")
- Ordem/Posição (número)
- Ativo (switch)

### 3. Atualização do Menu Lateral

Adicionar novo item após "Tutoriais":

```typescript
// adminNavItems (GlobalAdminLayout.tsx)
{ icon: Rocket, label: "Onboarding", path: "/global-admin/onboarding", roles: ["super_admin", "admin_operacional"] },
```

Atualizar breadcrumbMap:
```typescript
onboarding: "Onboarding",
```

### 4. Nova Rota

```typescript
// App.tsx
<Route path="onboarding" element={<GlobalAdminOnboarding />} />
```

### 5. Exportar Página

```typescript
// pages/global-admin/index.ts
export { default as GlobalAdminOnboarding } from "./GlobalAdminOnboarding";
```

---

## Detalhes Técnicos

### RLS para Admin Global

A tabela `onboarding_steps` já tem RLS habilitado, mas precisa de políticas para UPDATE/INSERT/DELETE pelo admin global:

```sql
-- Política para admin global fazer CRUD (a ser adicionada)
CREATE POLICY "Global admins can manage onboarding steps" ON onboarding_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM global_admin_profiles
      WHERE user_id = auth.uid()
    )
  );
```

### Validações no Formulário

- Título: Obrigatório, mínimo 3 caracteres
- YouTube ID: Extração automática de URL completa (mesmo padrão de tutoriais)
- Posição: Número inteiro >= 1
- Rota: Deve começar com "/"

---

## Fluxo de Uso

```text
1. Admin acessa /global-admin/onboarding
   ↓
2. Visualiza lista de etapas existentes
   ↓
3. Pode:
   - Editar etapa existente (botão lápis)
   - Ativar/Desativar etapa (toggle olho)
   - Excluir etapa (botão lixeira com confirmação)
   - Criar nova etapa (botão "Nova Etapa")
   - Atualizar URL de agendamento
   ↓
4. Alterações refletem imediatamente para novos clientes
```

---

## Benefícios

1. **Gerenciamento centralizado**: Etapas editáveis sem código
2. **Flexibilidade**: Adicionar/remover etapas conforme necessidade
3. **Consistência visual**: Mesmo padrão das outras páginas admin
4. **URL de agendamento configurável**: Sem deploy
5. **Segurança**: Acesso restrito a admins autorizados
