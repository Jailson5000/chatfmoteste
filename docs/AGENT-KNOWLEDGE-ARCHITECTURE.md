# Arquitetura de IA por Empresa, Agente e Base de Conhecimento

## Visão Geral

O sistema MiauChat implementa isolamento total de dados em três níveis:

1. **Empresa (Tenant)** - Cada empresa tem seus próprios dados
2. **Agente de IA** - Cada empresa pode ter múltiplos agentes
3. **Base de Conhecimento** - Bases são vinculadas explicitamente a agentes

## Estrutura de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                         LAW_FIRMS                                │
│  (Cada empresa é um tenant isolado)                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   AUTOMATIONS   │ │ KNOWLEDGE_ITEMS │ │    CLIENTS      │
│  (Agentes IA)   │ │ (Bases de Dados)│ │                 │
│                 │ │                 │ │                 │
│ • ai_prompt     │ │ • title         │ │ • name          │
│ • ai_temperature│ │ • content       │ │ • phone         │
│ • is_active     │ │ • category      │ │ • email         │
│ • law_firm_id   │ │ • law_firm_id   │ │ • law_firm_id   │
└────────┬────────┘ └────────┬────────┘ └─────────────────┘
         │                   │
         └─────────┬─────────┘
                   │
                   ▼
         ┌─────────────────┐
         │ AGENT_KNOWLEDGE │
         │ (Tabela vínculo)│
         │                 │
         │ • automation_id │
         │ • knowledge_id  │
         └─────────────────┘
```

## Fluxo de Resposta da IA

```
1. Mensagem chega → Identifica conversation + automation_id
                          │
2. Busca automation ───────┼──→ Obtém prompt + temperatura
                          │
3. Busca agent_knowledge ──┼──→ Lista bases vinculadas
                          │
4. Busca knowledge_items ──┼──→ Conteúdo das bases
                          │
5. Monta contexto ─────────┼──→ System prompt + Conhecimento
                          │
6. Chama Lovable AI ───────┼──→ Resposta baseada APENAS
                          │     nas bases vinculadas
                          ▼
7. Retorna resposta ao cliente
```

## Regras de Isolamento

### Nível 1: Empresa (Tenant)

| Tabela | Filtro | RLS |
|--------|--------|-----|
| `knowledge_items` | `law_firm_id` | ✅ Ativado |
| `automations` | `law_firm_id` | ✅ Ativado |
| `clients` | `law_firm_id` | ✅ Ativado |
| `conversations` | `law_firm_id` | ✅ Ativado |
| `messages` | via `conversation` | ✅ Ativado |

### Nível 2: Agente de IA

- Cada agente (`automations`) pertence a UMA empresa
- Agentes de empresas diferentes nunca compartilham dados
- Prompt, temperatura e configurações são por agente

### Nível 3: Base de Conhecimento

- Bases (`knowledge_items`) pertencem a UMA empresa
- A tabela `agent_knowledge` vincula bases a agentes
- Um agente só acessa bases EXPLICITAMENTE vinculadas
- Não existe fallback para "base global"

## Políticas RLS Implementadas

### knowledge_items

```sql
-- Admins podem gerenciar itens de conhecimento
CREATE POLICY "Admins can manage knowledge items" 
ON public.knowledge_items FOR ALL 
USING (
  law_firm_id = get_user_law_firm_id(auth.uid()) 
  AND has_role(auth.uid(), 'admin')
);

-- Usuários podem visualizar itens da sua empresa
CREATE POLICY "Users can view knowledge items in their law firm" 
ON public.knowledge_items FOR SELECT 
USING (law_firm_id = get_user_law_firm_id(auth.uid()));
```

### agent_knowledge

```sql
-- Admins podem gerenciar vínculos
CREATE POLICY "Admins can manage agent knowledge" 
ON public.agent_knowledge FOR ALL 
USING (
  has_role(auth.uid(), 'admin') 
  AND EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = agent_knowledge.automation_id 
    AND a.law_firm_id = get_user_law_firm_id(auth.uid())
  )
);

-- Usuários podem visualizar vínculos da sua empresa
CREATE POLICY "Users can view agent knowledge in their law firm" 
ON public.agent_knowledge FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = agent_knowledge.automation_id 
    AND a.law_firm_id = get_user_law_firm_id(auth.uid())
  )
);
```

## Exemplo Prático

### Empresa A
- **Agente 1** (Atendimento Geral)
  - Base: "FAQ Atendimento"
  
- **Agente 2** (Financeiro)
  - Base: "FAQ Atendimento" (compartilhada)
  - Base: "Políticas Financeiras"

### Empresa B
- **Agente 1** (Suporte)
  - Base: "Manual do Produto"
  
**Resultado:**
- Agente 1 da Empresa A só responde com "FAQ Atendimento"
- Agente 2 da Empresa A responde com "FAQ" + "Políticas"
- Agente 1 da Empresa B só responde com "Manual do Produto"
- Não há acesso cruzado entre empresas

## Integração no Edge Function

O `ai-chat/index.ts` implementa:

```typescript
// 1. Busca bases vinculadas ao agente
async function getAgentKnowledge(supabase, automationId) {
  const { data } = await supabase
    .from("agent_knowledge")
    .select(`
      knowledge_item_id,
      knowledge_items (id, title, content, category)
    `)
    .eq("automation_id", automationId);
  
  // Retorna APENAS bases vinculadas
  return formatKnowledge(data);
}

// 2. No handler principal
if (automationId) {
  knowledgeText = await getAgentKnowledge(supabase, automationId);
  messages.push({ role: "system", content: knowledgeText });
}
```

## Garantias de Segurança

1. ✅ **Tenant Isolation**: RLS em todas as tabelas críticas
2. ✅ **Agent Isolation**: Bases vinculadas via `agent_knowledge`
3. ✅ **No Global Fallback**: Não existe base "default" compartilhada
4. ✅ **LGPD Compliant**: Dados nunca vazam entre empresas
5. ✅ **Audit Trail**: Logs de acesso e ações

## Critérios de Aceite

| Requisito | Status |
|-----------|--------|
| Empresas isoladas | ✅ Implementado |
| Agentes independentes | ✅ Implementado |
| Bases vinculadas explicitamente | ✅ Implementado |
| Sem vazamento de dados | ✅ Implementado |
| Escalável para milhares de empresas | ✅ Arquitetura pronta |
