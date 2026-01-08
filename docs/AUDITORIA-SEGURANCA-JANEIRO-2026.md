# 🛡️ Auditoria de Segurança e Qualidade - MiauChat (Size)
## Data: 08/01/2026

---

# BLOCO 1 - SUMÁRIO EXECUTIVO

## Status Geral

| Critério | Status | Observação |
|----------|--------|------------|
| **Pronto para Teste** | ✅ SIM | Sistema funcional com segurança adequada |
| **Pronto para Venda** | ⚠️ QUASE | Necessário corrigir 5 itens críticos antes |

## Top 10 Problemas Mais Críticos

| # | Severidade | Área | Problema | Impacto |
|---|------------|------|----------|---------|
| 1 | 🔴 CRÍTICO | RLS | 10+ políticas RLS com `USING (true)` ou `WITH CHECK (true)` | Potencial exposição de dados entre tenants |
| 2 | 🔴 CRÍTICO | Dashboard | Dados de `teamActivity` são gerados aleatoriamente (`Math.random()`) | Métricas falsas para tomada de decisão |
| 3 | 🟠 ALTO | Extensão | Extensão instalada no schema `public` ao invés de schema dedicado | Risco de segurança conforme docs Supabase |
| 4 | 🟠 ALTO | Rota /calendar | Página órfã ainda acessível mas sem utilidade | Confusão de UX, possível bug |
| 5 | 🟠 ALTO | CORS | Evolution-webhook usa CORS `*` em ambiente de produção | Risco de CSRF em webhooks |
| 6 | 🟡 MÉDIO | UX | AgendaCalendar não valida se profissional está disponível no horário | Overbooking possível |
| 7 | 🟡 MÉDIO | Performance | Dashboard faz N+1 queries para cada conversa | Lentidão com muitos dados |
| 8 | 🟡 MÉDIO | Auth | Timeout de inicialização de 10s pode ser longo demais | UX ruim em redes lentas |
| 9 | 🟡 MÉDIO | Forms | Falta validação de tamanho máximo em vários campos de texto | DoS por payload grande |
| 10 | 🟢 BAIXO | UX | Scroll da seção "Mensagens Agendadas" era muito pequeno (200px) | **JÁ CORRIGIDO para 300px** |

---

# BLOCO 2 - ACHADOS DETALHADOS

## 2.1 CORE: Autenticação e Permissões

### 2.1.1 useAuth.tsx
**Caminho:** `src/hooks/useAuth.tsx`

**O que faz:**
- Gerencia sessão do usuário com Supabase Auth
- Refresh proativo de tokens (5 min antes de expirar)
- Detecção de tokens inválidos/corrompidos
- Flag `must_change_password` para primeiro acesso

**Pontos Positivos:**
- ✅ Timeout de segurança de 10s para evitar loading infinito
- ✅ Limpeza automática de localStorage em caso de erro
- ✅ Tratamento de erros fatais (bad_jwt, session_not_found)
- ✅ Logs detalhados para debugging

**Vulnerabilidades:** Nenhuma identificada

**Bugs/Melhorias:**
- O timeout de 10s pode ser muito longo em conexões rápidas (considerar 5s)

---

### 2.1.2 useUserRole.tsx
**Caminho:** `src/hooks/useUserRole.tsx`

**O que faz:**
- Busca role do usuário na tabela `user_roles`
- Roles: admin, gerente, advogado, estagiario, atendente

**Pontos Positivos:**
- ✅ Roles separadas em tabela dedicada (não no profiles) - CORRETO
- ✅ Default para role mais restritiva (atendente) em caso de erro

**Vulnerabilidades:** Nenhuma identificada

---

### 2.1.3 useAdminAuth.tsx
**Caminho:** `src/hooks/useAdminAuth.tsx`

**O que faz:**
- Autenticação para Global Admins (super_admin, admin_operacional, admin_financeiro)
- Busca role via RPC `get_admin_role` para evitar problemas de RLS

**Pontos Positivos:**
- ✅ Tabelas separadas (admin_profiles, admin_user_roles)
- ✅ RPC segura para buscar role
- ✅ Separação completa de usuários cliente vs admins globais

**Vulnerabilidades:** Nenhuma identificada

---

### 2.1.4 ProtectedRoute.tsx
**Caminho:** `src/components/auth/ProtectedRoute.tsx`

**O que faz:**
- Guard para rotas autenticadas
- Valida: autenticação → aprovação da empresa → subdomínio correto → troca de senha

**Pontos Positivos:**
- ✅ Múltiplas camadas de segurança
- ✅ Validação de subdomínio (multi-tenant)
- ✅ Bloqueia empresas pendentes/rejeitadas
- ✅ Force redirect para /change-password se necessário

**Vulnerabilidades:** Nenhuma identificada

---

### 2.1.5 GlobalAdminRoute.tsx
**Caminho:** `src/components/auth/GlobalAdminRoute.tsx`

**O que faz:**
- Guard para rotas de administração global
- Valida role específica (allowedRoles)

**Pontos Positivos:**
- ✅ Verificação de isAdmin antes de permitir acesso
- ✅ Suporte a roles específicas por rota

**Vulnerabilidades:** Nenhuma identificada

---

### 2.1.6 tenant-validation.ts (Edge Function Shared)
**Caminho:** `supabase/functions/_shared/tenant-validation.ts`

**O que faz:**
- Validação de tenant no backend para Edge Functions
- Extrai subdomínio do Origin/Referer
- Valida que usuário pertence ao tenant que está acessando

**Pontos Positivos:**
- ✅ Função `validateResourceBelongsToTenant` para prevenir IDOR
- ✅ Log de eventos de segurança em audit_logs
- ✅ Validação completa do contexto do tenant

**Vulnerabilidades:** Nenhuma identificada

---

## 2.2 PÁGINAS DO CLIENTE

### 2.2.1 Dashboard
**Caminho:** `src/pages/Dashboard.tsx` | **Rota:** `/dashboard`

**O que faz:**
- Visão geral de métricas: clientes por status, departamento, estado
- Gráficos de evolução temporal
- Filtros por período

**Dependências:** useCustomStatuses, useDepartments, useClients, useTeamMembers

**🔴 BUG CRÍTICO:**
```typescript
// Linha 298-306 - Dados falsos!
const teamActivity = useMemo(() => {
  return teamMembers.slice(0, 5).map((member, index) => ({
    name: member.full_name,
    conversations: Math.floor(Math.random() * 100) + 10, // ⚠️ FALSO
    resolved: Math.floor(Math.random() * 50), // ⚠️ FALSO
    pending: Math.floor(Math.random() * 20), // ⚠️ FALSO
  }));
}, [teamMembers]);
```

**Fix Recomendado:**
- Criar queries reais para contar conversas por atendente
- Ou remover essa seção até implementar corretamente

**Testes Recomendados:**
- [ ] Unit test para cálculo de métricas
- [ ] E2E test do filtro de datas

---

### 2.2.2 Conversations
**Caminho:** `src/pages/Conversations.tsx` | **Rota:** `/conversations`

**O que faz:**
- Lista de conversas do WhatsApp
- Chat em tempo real
- Transferência entre IA/humano

**Dependências:** useConversations, useMessagesWithPagination, useLawFirm

**Pontos Positivos:**
- ✅ Realtime subscription para atualizações
- ✅ Tenant isolation em todas as queries (law_firm_id)
- ✅ Paginação com scroll infinito

**Vulnerabilidades:** Nenhuma identificada

---

### 2.2.3 Kanban
**Caminho:** `src/pages/Kanban.tsx` | **Rota:** `/kanban`

**O que faz:**
- Visualização kanban de clientes por status/departamento
- Drag-and-drop para mover cards
- Painel de chat lateral

**Dependências:** useClients, useDepartments, useCustomStatuses

**Pontos Positivos:**
- ✅ Atualizações otimistas
- ✅ Infinite scroll por coluna
- ✅ Isolamento por tenant

**Melhorias:**
- Considerar debounce no drag-and-drop para evitar múltiplas requisições

---

### 2.2.4 Contacts
**Caminho:** `src/pages/Contacts.tsx` | **Rota:** `/contacts`

**O que faz:**
- CRUD de contatos/clientes
- Importação em massa (CSV)
- Filtros e paginação

**Dependências:** useClients, useTags, useDepartments

**Pontos Positivos:**
- ✅ Todas as operações validam law_firm_id
- ✅ Suporte a unificação de duplicados

**Vulnerabilidades:** Nenhuma identificada

---

### 2.2.5 Connections
**Caminho:** `src/pages/Connections.tsx` | **Rota:** `/connections`

**O que faz:**
- Gerenciamento de instâncias WhatsApp (Evolution API)
- QR Code para conexão
- Monitoramento de saúde

**Dependências:** useWhatsAppInstances

**Pontos Positivos:**
- ✅ Isolamento por tenant
- ✅ Verificação de limites do plano

**Vulnerabilidades:** Nenhuma identificada

---

### 2.2.6 AIAgents / AIAgentEdit
**Caminho:** `src/pages/AIAgents.tsx`, `src/pages/AIAgentEdit.tsx` | **Rota:** `/ai-agents`, `/ai-agents/:id/edit`

**O que faz:**
- Gerenciamento de agentes de IA
- Configuração de prompts
- Vinculação de base de conhecimento

**Dependências:** useAutomations, useKnowledgeItems

**Pontos Positivos:**
- ✅ Validação de tenant no backend (get-agent-knowledge)
- ✅ Proteção contra IDOR na Edge Function

**Vulnerabilidades:** Nenhuma identificada

---

### 2.2.7 Agenda
**Caminho:** `src/pages/Agenda.tsx` | **Rota:** `/agenda`

**O que faz:**
- Sistema completo de agendamentos
- Integração com Google Calendar
- Lembretes automáticos

**Dependências:** useAppointments, useServices, useProfessionals, useGoogleCalendar

**🟡 BUG MÉDIO:**
- AgendaCalendar não valida conflitos de horário ao criar agendamento
- Possível overbooking se dois usuários agendarem simultaneamente

**Fix Recomendado:**
```typescript
// Em NewAppointmentDialog, antes de salvar:
const conflictCheck = await supabase
  .from('appointments')
  .select('id')
  .eq('professional_id', professionalId)
  .gte('start_time', startTime)
  .lt('end_time', endTime)
  .single();

if (conflictCheck.data) {
  throw new Error('Horário já ocupado');
}
```

---

### 2.2.8 Settings
**Caminho:** `src/pages/Settings.tsx` | **Rota:** `/settings`

**O que faz:**
- Configurações da empresa
- Status, etiquetas, departamentos
- Templates de mensagens
- Integrações

**Dependências:** useLawFirm, useCustomStatuses, useTags, useDepartments

**Pontos Positivos:**
- ✅ Todas as operações restritas ao tenant

**Vulnerabilidades:** Nenhuma identificada

---

### 2.2.9 Calendar (Página Órfã)
**Caminho:** `src/pages/Calendar.tsx` | **Rota:** `/calendar`

**🟠 PROBLEMA:**
- Botão foi removido da sidebar mas a rota ainda existe
- Página pode estar desatualizada/bugada

**Fix Recomendado:**
- Remover a rota do App.tsx se não for mais usada
- Ou redirecionar para /agenda

---

## 2.3 PÁGINAS DO ADMIN (Cliente)

### 2.3.1 AdminDashboard
**Caminho:** `src/pages/admin/AdminDashboard.tsx` | **Rota:** `/admin`

**O que faz:**
- Dashboard administrativo da empresa
- Métricas de uso

**Proteção:** AdminRoute com role "admin"

---

### 2.3.2 AdminTeam
**Caminho:** `src/pages/admin/AdminTeam.tsx` | **Rota:** `/admin/team`

**O que faz:**
- Gerenciamento de membros da equipe
- Convites por email
- Atribuição de roles e departamentos

**Dependências:** useTeamMembers, invite-team-member Edge Function

**Pontos Positivos:**
- ✅ Apenas admin/gerente pode convidar
- ✅ Validação de law_firm_id no backend
- ✅ Email com senha temporária + obriga troca

**Vulnerabilidades:** Nenhuma identificada

---

### 2.3.3 AdminCompany
**Caminho:** `src/pages/admin/AdminCompany.tsx` | **Rota:** `/admin/company`

**O que faz:**
- Configurações da empresa
- Dados cadastrais

**Vulnerabilidades:** Nenhuma identificada

---

## 2.4 PÁGINAS DO GLOBAL ADMIN

### 2.4.1 GlobalAdminAuth
**Caminho:** `src/pages/global-admin/GlobalAdminAuth.tsx` | **Rota:** `/global-admin/auth`

**O que faz:**
- Login para administradores globais
- Tema escuro fixo

**Pontos Positivos:**
- ✅ Sem opção de cadastro público
- ✅ Redireciona se já autenticado

---

### 2.4.2 GlobalAdminDashboard
**Caminho:** `src/pages/global-admin/GlobalAdminDashboard.tsx` | **Rota:** `/global-admin`

**O que faz:**
- Visão geral do SaaS
- Métricas de empresas, instâncias, uso

**Proteção:** GlobalAdminRoute (qualquer admin role)

---

### 2.4.3 GlobalAdminCompanies
**Caminho:** `src/pages/global-admin/GlobalAdminCompanies.tsx` | **Rota:** `/global-admin/companies`

**O que faz:**
- CRUD de empresas/tenants
- Aprovação/rejeição de cadastros
- Configuração de limites

**Pontos Positivos:**
- ✅ Apenas admins globais têm acesso
- ✅ Audit logs para ações críticas

---

### 2.4.4 GlobalAdminUsers
**Caminho:** `src/pages/global-admin/GlobalAdminUsers.tsx` | **Rota:** `/global-admin/users`

**O que faz:**
- Gerenciamento de admins globais
- Reset de senha
- Ativação/desativação

**Proteção:** Apenas super_admin

**Pontos Positivos:**
- ✅ RPCs seguras (update_admin_role, toggle_admin_active)
- ✅ Impede desativar o último super_admin
- ✅ Logs de auditoria completos

---

### 2.4.5 GlobalAdminSettings
**Caminho:** `src/pages/global-admin/GlobalAdminSettings.tsx` | **Rota:** `/global-admin/settings`

**O que faz:**
- Configurações globais do sistema

**Proteção:** Apenas super_admin

---

## 2.5 EDGE FUNCTIONS

### 2.5.1 evolution-webhook
**Caminho:** `supabase/functions/evolution-webhook/index.ts`

**O que faz:**
- Recebe webhooks da Evolution API
- Processa mensagens recebidas
- Encaminha para IA ou humano

**🟠 PROBLEMA: CORS Aberto**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // ⚠️ Muito permissivo
  'Access-Control-Allow-Headers': '...',
};
```

**Fix Recomendado:**
- Para webhooks externos, CORS aberto é necessário
- MAS: Adicionar validação de assinatura/token do Evolution API
```typescript
const evolutionToken = req.headers.get('x-evolution-token');
const expectedToken = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
if (evolutionToken !== expectedToken) {
  return new Response('Unauthorized', { status: 401 });
}
```

---

### 2.5.2 admin-reset-password
**Caminho:** `supabase/functions/admin-reset-password/index.ts`

**O que faz:**
- Reset de senha por super_admin
- Gera senha temporária
- Força troca no próximo login

**Pontos Positivos:**
- ✅ Apenas super_admin pode executar
- ✅ Audit logs para todas as tentativas
- ✅ Senha gerada no servidor (não enviada pelo cliente)
- ✅ Flag must_change_password ativada

---

### 2.5.3 invite-team-member
**Caminho:** `supabase/functions/invite-team-member/index.ts`

**O que faz:**
- Cria usuário e envia convite por email
- Atribui role e departamentos

**Pontos Positivos:**
- ✅ Valida que convidador pertence ao mesmo law_firm
- ✅ Apenas admin/gerente pode convidar
- ✅ Email com URL correta do subdomínio

---

### 2.5.4 get-agent-knowledge
**Caminho:** `supabase/functions/get-agent-knowledge/index.ts`

**O que faz:**
- Retorna base de conhecimento para agente IA

**Pontos Positivos:**
- ✅ Validação JWT obrigatória
- ✅ Validação de formato UUID
- ✅ Proteção contra IDOR (valida tenant)
- ✅ Erro genérico (não revela se existe em outro tenant)

---

## 2.6 SEGURANÇA DE BANCO DE DADOS

### 2.6.1 Políticas RLS com Problemas

**🔴 CRÍTICO:** O linter identificou 10+ políticas com `USING (true)` ou `WITH CHECK (true)`:

| Tabela | Política | Risco |
|--------|----------|-------|
| admin_notification_logs | Service role insert | ⚠️ Avaliar |
| ai_processing_queue | Service role full access | ✅ OK (apenas service role) |
| ai_transfer_logs | System insert | ✅ OK (logs de sistema) |
| audit_logs | System insert | ✅ OK (logs de auditoria) |
| google_calendar_ai_logs | System insert | ✅ OK (logs) |
| instance_status_history | System insert | ✅ OK (logs) |
| system_metrics | System insert | ✅ OK (métricas) |
| usage_history_monthly | System manage | ⚠️ Avaliar |

**Análise:**
- A maioria são tabelas de log/métricas onde apenas o backend (service role) escreve
- Isso é um padrão aceitável DESDE QUE:
  - Nenhum usuário cliente consiga chamar INSERT diretamente
  - As Edge Functions usem service_role_key internamente

---

### 2.6.2 Extensão no Schema Public

**🟠 PROBLEMA:**
- Extensão instalada em `public` ao invés de schema dedicado
- Supabase recomenda criar schema separado para extensões

**Fix Recomendado:**
```sql
-- Criar schema para extensões
CREATE SCHEMA IF NOT EXISTS extensions;

-- Mover extensão
ALTER EXTENSION "extension_name" SET SCHEMA extensions;
```

---

# BLOCO 3 - DOCUMENTAÇÃO PARA VÍDEO

## 3.1 CLIENTE (Usuário Final)

### Ordem Sugerida para o Vídeo:
1. Login
2. Dashboard
3. Conversas
4. Kanban
5. Contatos
6. Agenda (se disponível)
7. Configurações
8. Conexões (WhatsApp)
9. Agentes de IA

### Páginas Detalhadas:

#### 1. Login (`/auth`)
- **Objetivo:** Autenticar usuário
- **Ações:** Email/senha, "Esqueci senha"
- **Regras:** Empresa deve estar aprovada
- **Dados:** Credenciais do usuário

#### 2. Dashboard (`/dashboard`)
- **Objetivo:** Visão geral de métricas
- **Ações:** Filtrar por período, visualizar gráficos
- **Regras:** Dados filtrados por tenant
- **Dados:** Contatos, status, departamentos, estados

#### 3. Conversas (`/conversations`)
- **Objetivo:** Atendimento via WhatsApp
- **Ações:** Enviar mensagens, transferir, arquivar
- **Regras:** Só vê conversas do próprio tenant
- **Integrações:** WhatsApp (Evolution API), IA

#### 4. Kanban (`/kanban`)
- **Objetivo:** Gestão visual de clientes
- **Ações:** Arrastar cards, mudar status/departamento
- **Regras:** Atualizações em tempo real
- **Dados:** Clientes agrupados por status ou departamento

#### 5. Contatos (`/contacts`)
- **Objetivo:** CRM de clientes
- **Ações:** Criar, editar, excluir, importar CSV
- **Regras:** Isolamento por tenant
- **Dados:** Nome, telefone, email, status, tags

#### 6. Agenda (`/agenda`)
- **Objetivo:** Agendamento de serviços
- **Ações:** Criar agendamentos, configurar lembretes
- **Regras:** Requer Google Calendar conectado
- **Integrações:** Google Calendar, WhatsApp

#### 7. Configurações (`/settings`)
- **Objetivo:** Configurar empresa
- **Ações:** Editar status, tags, departamentos, templates
- **Regras:** Apenas admin pode alterar algumas configs
- **Dados:** Configurações do tenant

#### 8. Conexões (`/connections`)
- **Objetivo:** Gerenciar WhatsApp
- **Ações:** Conectar via QR, monitorar saúde
- **Regras:** Limite por plano
- **Integrações:** Evolution API

#### 9. Agentes de IA (`/ai-agents`)
- **Objetivo:** Configurar automações de IA
- **Ações:** Criar/editar prompts, vincular conhecimento
- **Regras:** Isolamento por tenant
- **Integrações:** OpenAI/Google AI

---

## 3.2 ADMIN (Administrador da Empresa)

### Ordem Sugerida:
1. Dashboard Admin
2. Equipe
3. Empresa
4. Configurações Admin

### Páginas Detalhadas:

#### 1. Dashboard Admin (`/admin`)
- **Objetivo:** Métricas administrativas
- **Ações:** Visualizar uso, limites
- **Regras:** Apenas role "admin"

#### 2. Equipe (`/admin/team`)
- **Objetivo:** Gerenciar membros
- **Ações:** Convidar, editar roles, desativar
- **Regras:** Admin/gerente pode convidar
- **Dados:** Membros, roles, departamentos

#### 3. Empresa (`/admin/company`)
- **Objetivo:** Dados da empresa
- **Ações:** Editar informações cadastrais
- **Regras:** Apenas admin

#### 4. Configurações Admin (`/admin/settings`)
- **Objetivo:** Configurações avançadas
- **Ações:** Configurar plano, limites
- **Regras:** Apenas admin

---

## 3.3 GLOBAL ADMIN (Administração MiauChat)

### Ordem Sugerida:
1. Login Global Admin
2. Dashboard
3. Empresas
4. Conexões
5. Planos
6. Pagamentos
7. Usuários
8. Monitoramento
9. Template Base
10. Configurações

### Páginas Detalhadas:

#### 1. Login (`/global-admin/auth`)
- **Objetivo:** Acesso à administração global
- **Ações:** Email/senha
- **Regras:** Sem cadastro público

#### 2. Dashboard (`/global-admin`)
- **Objetivo:** Visão geral do SaaS
- **Ações:** Visualizar métricas globais
- **Dados:** Total de empresas, instâncias, uso

#### 3. Empresas (`/global-admin/companies`)
- **Objetivo:** Gerenciar tenants
- **Ações:** Aprovar, rejeitar, editar limites
- **Regras:** Todos os admins globais

#### 4. Conexões (`/global-admin/connections`)
- **Objetivo:** Monitorar todas as instâncias WhatsApp
- **Ações:** Ver saúde, reconectar
- **Regras:** Bypass de RLS para ver tudo

#### 5. Planos (`/global-admin/plans`)
- **Objetivo:** Gerenciar planos SaaS
- **Ações:** CRUD de planos
- **Dados:** Preços, limites

#### 6. Usuários (`/global-admin/users`)
- **Objetivo:** Gerenciar admins globais
- **Ações:** Criar, editar role, reset senha, desativar
- **Regras:** Apenas super_admin

---

## 3.4 GLOSSÁRIO

| Termo | Definição |
|-------|-----------|
| **Tenant** | Empresa/cliente isolado no sistema multi-tenant |
| **Law Firm** | Entidade principal do tenant (herança do nome original) |
| **RLS** | Row Level Security - políticas de segurança no banco |
| **IDOR** | Insecure Direct Object Reference - vulnerabilidade de acesso |
| **Edge Function** | Função serverless do Supabase |
| **Evolution API** | API para WhatsApp Business |
| **Subdomínio** | URL única por empresa (empresa.miauchat.com.br) |

---

## 3.5 FLUXO MACRO DO SISTEMA

```
[Registro Empresa] → [Aprovação Global Admin] → [Criação Tenant]
         ↓
[Login via Subdomínio] → [Verificação Tenant] → [Acesso Dashboard]
         ↓
[Conexão WhatsApp] → [Recebimento Mensagens] → [IA ou Humano]
         ↓
[Atendimento] → [Histórico em Conversas] → [Dados em Kanban/CRM]
         ↓
[Agendamentos] → [Lembretes Automáticos] → [Notificação WhatsApp]
```

---

# LISTAS FINAIS

## ✅ Must Fix ANTES DO TESTE

1. **Dashboard.tsx linha 298-306** - Remover dados aleatórios de teamActivity
2. **Verificar políticas RLS** - Auditar as 10+ políticas com `true`
3. **Remover ou redirecionar /calendar** - Página órfã

## ✅ Must Fix ANTES DA VENDA

1. **Dashboard** - Implementar métricas reais de equipe
2. **evolution-webhook** - Adicionar validação de token/assinatura
3. **AgendaCalendar** - Validar conflitos de horário
4. **Extensão** - Mover para schema dedicado

## 🎯 Nice to Have

1. Reduzir timeout de auth para 5s
2. Implementar rate limiting em endpoints públicos
3. Adicionar CSP headers
4. Implementar cache Redis para queries frequentes
5. Adicionar monitoramento de performance (APM)

---

## ASSUNÇÕES FEITAS

| Assunção | Como Confirmar |
|----------|----------------|
| Evolution API tem suporte a tokens de webhook | Verificar documentação da Evolution API |
| Todas as Edge Functions usam service_role internamente | Revisar cada função manualmente |
| Não há acesso direto ao banco pelos clientes | Verificar configuração do Supabase |

---

*Auditoria realizada em 08/01/2026*
*Auditor: Claude (Lovable AI)*
