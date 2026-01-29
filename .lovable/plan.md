
# Plano: Limpeza de Law Firms Órfãos (Empresas Sem Company)

## Análise dos Dados

### Law Firms Órfãos Identificados: 11

| Nome | Subdomain | Usuários | Conversas | Clientes | Mensagens | Risco |
|------|-----------|----------|-----------|----------|-----------|-------|
| Escritório de Gabrielle Martins | gabriellemartins | 0 | 0 | 0 | 0 | Seguro |
| Empresa Teste MIAUCHAT | empresatestemiauchat | 1 | 0 | 0 | 0 | Baixo |
| Empresa Teste MIAUCHAT | (null) | 0 | 0 | 0 | 0 | Seguro |
| Empresa Teste Aprovação | empresa-teste-aprovacao | 0 | 0 | 0 | 0 | Seguro |
| Escritório de Junior | (null) | 0 | 0 | 0 | 0 | Seguro |
| Escritório de Gabrielle | (null) | 1 | 0 | 0 | 0 | Baixo |
| JuninLaranjinha | junin | 0 | 0 | 0 | 0 | Seguro |
| Escritório de Jair | (null) | 1 | 0 | 0 | 0 | Baixo |
| Junin | junin-3iki | 0 | 0 | 0 | 0 | Seguro |
| **Teste Miau** | teste-miau | **1** | **6** | **6** | **82** | **Atenção** |
| Miau test | miau-test | 0 | 0 | 0 | 0 | Seguro |

### Perfis de Usuários Órfãos: 4

| Email | Law Firm | Dados |
|-------|----------|-------|
| teste@exemplo.com | Empresa Teste MIAUCHAT | Sem dados |
| tulipabelezacuidados@gmail.com | Escritório de Gabrielle | Sem dados |
| jailsonferreira@fmo.adv.br | Escritório de Jair | Sem dados |
| **miautest00@gmail.com** | **Teste Miau** | **82 mensagens, 6 clientes** |

---

## Problema de Origem

Esses law_firms órfãos foram criados por:
1. **Fluxos de registro antigos** - antes do sistema de provisionamento completo
2. **Testes de desenvolvimento** - cadastros de teste incompletos
3. **Falhas no provisionamento** - company não foi criada após law_firm

---

## Solução Proposta

### Abordagem: Ferramenta de Limpeza no Admin Global

Criar uma seção dedicada em GlobalAdminCompanies para visualizar e limpar law_firms órfãos de forma segura e controlada.

### Parte 1: Hook para Law Firms Órfãos

Criar `useOrphanLawFirms.tsx`:

```typescript
interface OrphanLawFirm {
  id: string;
  name: string;
  subdomain: string | null;
  created_at: string;
  user_count: number;
  conversation_count: number;
  client_count: number;
  message_count: number;
  has_data: boolean;
}

// Query para buscar órfãos com métricas
// DELETE com cascade para remover dados dependentes
```

### Parte 2: UI de Limpeza

Adicionar nova aba "Órfãos" em GlobalAdminCompanies:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EMPRESAS ADMIN                                                              │
│                                                                              │
│  [Aprovadas] [Pendentes] [Rejeitadas] [🧹 Órfãos (11)]                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ ⚠️ Law Firms sem Company Associada                                    │ │
│  │                                                                        │ │
│  │ Esses registros ficaram órfãos por falhas no provisionamento ou       │ │
│  │ fluxos de teste antigos.                                              │ │
│  │                                                                        │ │
│  │ [🗑️ Limpar Todos Vazios (8)]  [⚠️ Limpar Selecionados]               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Nome                        | Subdomain          | Users | Conv | Ação     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ☐ Escritório Gabrielle M.  | gabriellemartins   | 0     | 0    | 🗑️       │
│  ☐ Empresa Teste MIAUCHAT   | empresateste...    | 1     | 0    | 🗑️ ⚠️    │
│  ☑ Teste Miau ⚠️            | teste-miau         | 1     | 6    | 🔒 DADOS │
│                                                                              │
│  ⚠️ Items com dados requerem confirmação adicional                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Parte 3: Lógica de Exclusão Segura

A exclusão deve seguir ordem correta para respeitar foreign keys:

```sql
-- Ordem de exclusão (respeitando FK constraints):
1. messages (via conversation_id)
2. client_tags (via client_id)
3. client_memories (via client_id)
4. scheduled_follow_ups (via client_id)
5. clients
6. conversations
7. automations
8. agent_knowledge (via automation_id)
9. knowledge_items
10. departments
11. custom_statuses
12. tags
13. templates
14. law_firm_settings
15. profiles (limpa vínculo, não deleta usuário auth)
16. law_firms
```

### Parte 4: Salvaguardas

1. **Confirmação dupla** para law_firms com dados
2. **Log de auditoria** de exclusões
3. **Não excluir usuários auth.users** - apenas desvincula profiles
4. **Backup em memória** antes de exclusão (exibir dados que serão perdidos)

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/hooks/useOrphanLawFirms.tsx` | **CRIAR** - Hook para buscar e gerenciar órfãos |
| `src/pages/global-admin/GlobalAdminCompanies.tsx` | **MODIFICAR** - Adicionar aba "Órfãos" |
| `supabase/functions/cleanup-orphan-lawfirm/index.ts` | **CRIAR** - Edge function para exclusão segura |

---

## Fluxo de Exclusão

```
USUÁRIO SELECIONA LAW FIRM ÓRFÃ
         ↓
SISTEMA MOSTRA RESUMO DE DADOS
┌────────────────────────────────┐
│ Excluir "Teste Miau"?          │
│                                │
│ Serão removidos:               │
│ • 1 usuário (perfil)           │
│ • 6 conversas                  │
│ • 6 clientes                   │
│ • 82 mensagens                 │
│ • 1 automação                  │
│ • 1 tag                        │
│                                │
│ ⚠️ Esta ação é irreversível!  │
│                                │
│ Digite "CONFIRMAR" para prosseguir │
│ [___________]                  │
│                                │
│ [Cancelar]  [Excluir]          │
└────────────────────────────────┘
         ↓
EDGE FUNCTION cleanup-orphan-lawfirm
         ↓
EXCLUSÃO EM CASCATA
         ↓
LOG EM audit_logs
         ↓
✅ SUCESSO
```

---

## Categorização dos Órfãos

| Categoria | Quantidade | Ação Recomendada |
|-----------|------------|------------------|
| **Vazios** (sem dados) | 8 | Exclusão automática segura |
| **Com usuários apenas** | 2 | Revisar antes de excluir |
| **Com dados reais** | 1 | Requer análise manual |

---

## Seção Técnica

### Interface TypeScript

```typescript
interface OrphanLawFirm {
  id: string;
  name: string;
  subdomain: string | null;
  email: string | null;
  created_at: string;
  
  // Contagens
  user_count: number;
  conversation_count: number;
  client_count: number;
  message_count: number;
  automation_count: number;
  
  // Computed
  has_data: boolean;
  risk_level: 'safe' | 'low' | 'attention';
}
```

### Edge Function Payload

```typescript
interface CleanupRequest {
  law_firm_ids: string[];
  confirm_data_deletion: boolean; // Required if any has data
}

interface CleanupResponse {
  success: boolean;
  deleted_count: number;
  errors: { law_firm_id: string; error: string }[];
  audit_log_ids: string[];
}
```

---

## Prevenção de Regressões

1. **Isolar funcionalidade** - Nova aba separada, não afeta fluxos existentes
2. **Edge function dedicada** - Não modifica delete existente de companies
3. **Validação de admin** - Apenas super_admin pode executar limpeza
4. **Não afeta law_firms com company** - Query filtra apenas órfãos
5. **Auditoria completa** - Todas ações registradas em audit_logs
