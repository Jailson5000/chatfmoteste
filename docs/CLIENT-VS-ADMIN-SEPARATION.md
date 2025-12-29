# MiauChat - Separação de Arquitetura: Cliente vs Admin

## 📋 Visão Geral

Este documento define claramente a separação entre o **Produto do Cliente** (este projeto) e o **Painel Admin Global** (projeto separado).

---

## 1️⃣ Este Projeto = Produto do Cliente

### O que PERTENCE a este projeto:

| Funcionalidade | Descrição | Status |
|----------------|-----------|--------|
| **Conversas** | Gerenciar conversas WhatsApp da empresa | ✅ Correto |
| **Kanban** | Organizar clientes por departamentos | ✅ Correto |
| **Contatos** | Lista de clientes da empresa | ✅ Correto |
| **Dashboard** | Analytics e métricas da empresa | ✅ Correto |
| **Agentes IA** | Automações configuradas pela empresa | ✅ Correto |
| **Base de Conhecimento** | Documentos da empresa para IA | ✅ Correto |
| **Conexões** | Instâncias WhatsApp da empresa | ✅ Correto |
| **Configurações** | Status, Tags, Departamentos, Templates | ✅ Correto |
| **Equipe** | Membros da equipe da empresa | ✅ Correto |
| **Perfil** | Configurações do usuário logado | ✅ Correto |

### Princípio: Tudo é isolado por `law_firm_id`

Cada empresa (tenant) só vê e gerencia seus próprios dados. O isolamento é garantido por:
- **RLS (Row Level Security)** no banco de dados
- **Contexto de Tenant** no frontend (`useTenant`, `useLawFirm`)

---

## 2️⃣ Painel Admin Global (Projeto Separado)

### O que NÃO deve estar neste projeto:

| Funcionalidade | Descrição | Onde Implementar |
|----------------|-----------|------------------|
| **Gestão de Empresas** | Criar, editar, suspender tenants | Admin Panel |
| **Configuração Global Evolution** | API Key Global do servidor | Admin Panel |
| **Gestão de Planos** | Assinaturas, limites, billing | Admin Panel |
| **Monitoramento Global** | Status de todas as empresas | Admin Panel |
| **Usuários Globais** | Admins da plataforma | Admin Panel |
| **Logs Globais** | Auditoria de todo o sistema | Admin Panel |
| **Configurações do Servidor** | URLs, chaves, integrações globais | Admin Panel |

---

## 3️⃣ Arquivos Removidos/Migrados

Os seguintes arquivos foram identificados como pertencentes ao Admin Global:

### Componentes Removidos:
```
❌ src/components/connections/EvolutionAdminConfig.tsx
   → Migrar para: admin-panel/src/components/EvolutionConfig.tsx
   → Razão: Configura API Key Global, não deve ser exposto ao cliente
```

### Endpoints Backend que são GLOBAIS:

```typescript
// supabase/functions/evolution-api/index.ts

// ESTES ENDPOINTS SÃO GLOBAIS E DEVEM SER MOVIDOS:
case "global_create_instance":  // Usa EVOLUTION_GLOBAL_API_KEY
case "global_delete_instance":  // Usa EVOLUTION_GLOBAL_API_KEY

// NOTA: Estes endpoints usam chaves de ambiente globais.
// O cliente não tem acesso a essas chaves.
// Funcionam porque o backend gerencia isso de forma transparente.
```

---

## 4️⃣ Modelo de Dados

### Dados do Cliente (law_firm específico):
```sql
-- Todas estas tabelas são filtradas por law_firm_id
clients           -- Clientes da empresa
conversations     -- Conversas da empresa
messages          -- Mensagens das conversas
departments       -- Departamentos da empresa
custom_statuses   -- Status personalizados
tags              -- Etiquetas
templates         -- Templates de mensagem
automations       -- Agentes IA
knowledge_items   -- Base de conhecimento
whatsapp_instances-- Conexões WhatsApp
profiles          -- Membros da equipe
```

### Dados Globais (Admin Panel):
```sql
-- Estas tabelas seriam gerenciadas pelo Admin Global:
law_firms         -- Lista de todas as empresas (tenants)
plans             -- Planos de assinatura (futuro)
subscriptions     -- Assinaturas das empresas (futuro)
global_settings   -- Configurações globais (futuro)
admin_users       -- Usuários administradores da plataforma (futuro)
```

---

## 5️⃣ Roles e Permissões

### Neste Projeto (Cliente):
```typescript
type AppRole = "admin" | "advogado" | "estagiario" | "atendente";

// "admin" aqui significa: Administrador DA EMPRESA
// NÃO significa administrador global da plataforma
```

### No Admin Panel (futuro):
```typescript
type GlobalRole = "super_admin" | "support" | "billing";

// Estes roles teriam acesso cross-tenant
```

---

## 6️⃣ Variáveis de Ambiente

### Neste Projeto (Cliente):
```bash
VITE_SUPABASE_URL          # URL do Supabase
VITE_SUPABASE_PUBLISHABLE_KEY  # Chave pública do Supabase
VITE_ENVIRONMENT           # development | staging | production
VITE_BASE_DOMAIN           # miauchat.com.br
```

### No Admin Panel (futuro):
```bash
EVOLUTION_BASE_URL         # URL global do Evolution
EVOLUTION_GLOBAL_API_KEY   # Chave mestre do Evolution
ADMIN_SUPABASE_SERVICE_KEY # Chave de serviço (acesso total)
STRIPE_SECRET_KEY          # Billing
```

---

## 7️⃣ Fluxo de Onboarding de Novo Cliente

```
1. [ADMIN PANEL] Cria nova empresa (law_firm)
   └── Define: nome, subdomínio, plano

2. [ADMIN PANEL] Configura conexão WhatsApp
   └── Usa API Key Global para criar instância

3. [ADMIN PANEL] Cria usuário admin da empresa
   └── Envia email de convite

4. [CLIENTE] Usuário acessa: empresa.miauchat.com.br
   └── Configura sua conta, equipe, automações

5. [CLIENTE] Gerencia dia a dia
   └── Conversas, Kanban, Contatos, etc.
```

---

## 8️⃣ Checklist de Validação

Antes de implementar qualquer funcionalidade, pergunte:

| Pergunta | Se SIM | Se NÃO |
|----------|--------|--------|
| O cliente final usa isso? | ✅ Implementar aqui | ❌ Admin Panel |
| É isolado por empresa? | ✅ Implementar aqui | ❌ Admin Panel |
| Requer acesso cross-tenant? | ❌ Admin Panel | ✅ Implementar aqui |
| Envolve chaves globais? | ❌ Admin Panel | ✅ Implementar aqui |
| É configuração de plano/billing? | ❌ Admin Panel | ✅ Implementar aqui |

---

## 9️⃣ Próximos Passos

### Para criar o Admin Panel:
1. Criar novo projeto Lovable: `miauchat-admin`
2. Migrar componentes de admin global
3. Implementar autenticação de super-admin
4. Criar interface de gestão de tenants
5. Conectar ao mesmo Supabase (com service key)

### Para este projeto:
1. ✅ Remover `EvolutionAdminConfig.tsx`
2. ✅ Documentar separação
3. ⏳ Integrar `TenantProvider` no App
4. ⏳ Criar página de erro para tenant não encontrado

---

**Última atualização:** Dezembro 2024
