
# Plano: Corrigir Comportamento Indevido das Tools CRM da IA

## Problemas Identificados

### Problema 1: IA Cria Tags Novas (CRÍTICO)
**Evidência:** `IA Maria adicionou tag Solicitar documentação` - tag criada dinamicamente

**Causa Raiz:** Linhas 641-656 do `ai-chat/index.ts`:
```typescript
if (!tag) {
  // Create new tag ← BUG: Cria tag automaticamente
  const { data: newTag, error } = await supabase
    .from("tags")
    .insert({...})
}
```

A IA deveria **apenas gerenciar tags existentes**, não criar novas.

### Problema 2: IA Muda Status para o Mesmo Status (CRÍTICO)
**Evidência:** `from_value:Qualificado to_value:Qualificado` - 4 vezes em 10 minutos

**Causa Raiz:** A função `change_status` não verifica se o cliente **já está** no status solicitado antes de executar a mudança e registrar o log.

### Problema 3: IA Transfere para o Mesmo Departamento Repetidamente
**Evidência:** 3 transferências para "Documentação Recebida" em poucos minutos

**Causa Raiz:** A função `transfer_to_department` não verifica se a conversa/cliente **já está** naquele departamento.

### Problema 4: IA Não Conhece as Opções Disponíveis
**Causa Raiz:** As definições das tools (`CRM_TOOLS`) usam exemplos genéricos:
```typescript
description: "Nome do departamento para transferir (ex: 'Suporte', 'Comercial', 'Financeiro')"
```

A IA não sabe quais departamentos/status/tags **realmente existem** no tenant, então ela "inventa" ou usa repetidamente.

---

## Solução Proposta

### Correção 1: Proibir Criação de Tags Pela IA

**Arquivo:** `supabase/functions/ai-chat/index.ts`

**Mudança:** Modificar a função `add_tag` para APENAS gerenciar tags existentes:

```typescript
case "add_tag": {
  if (!clientId) {
    return JSON.stringify({ success: false, error: "Cliente não identificado" });
  }
  
  // ONLY find existing tags - do NOT create
  const { data: tag } = await supabase
    .from("tags")
    .select("id, name")
    .eq("law_firm_id", lawFirmId)
    .ilike("name", args.tag_name)
    .maybeSingle();
  
  if (!tag) {
    // List available tags for AI to learn
    const { data: allTags } = await supabase
      .from("tags")
      .select("name")
      .eq("law_firm_id", lawFirmId);
    const availableTags = allTags?.map((t: any) => t.name).join(", ") || "nenhuma";
    
    return JSON.stringify({ 
      success: false, 
      error: `Tag "${args.tag_name}" não existe. Tags disponíveis: ${availableTags}. Você só pode usar tags existentes.`
    });
  }
  
  // ... resto do código (verificar se já tem, adicionar, etc.)
}
```

### Correção 2: Validar Status Antes de Mudar

**Arquivo:** `supabase/functions/ai-chat/index.ts`

**Mudança:** Adicionar validação para evitar mudança para o mesmo status:

```typescript
case "change_status": {
  // ... código existente de busca ...
  
  // Get current status
  const { data: client } = await supabase
    .from("clients")
    .select("custom_status_id, custom_statuses(name)")
    .eq("id", clientId)
    .single();
  
  const fromStatus = (client?.custom_statuses as any)?.name || "Sem status";
  
  // NEW: Check if already in target status
  if (client?.custom_status_id === targetStatus.id) {
    return JSON.stringify({ 
      success: true, 
      message: `Cliente já está no status "${targetStatus.name}". Nenhuma alteração necessária.`,
      already_set: true
    });
  }
  
  // ... resto do código (update, log) ...
}
```

### Correção 3: Validar Departamento Antes de Transferir

**Arquivo:** `supabase/functions/ai-chat/index.ts`

**Mudança:** Verificar se já está no departamento:

```typescript
case "transfer_to_department": {
  // ... código existente de busca ...
  
  // NEW: Check if conversation is already in this department
  const { data: currentConv } = await supabase
    .from("conversations")
    .select("department_id")
    .eq("id", conversationId)
    .single();
  
  if (currentConv?.department_id === targetDept.id) {
    return JSON.stringify({ 
      success: true, 
      message: `Conversa já está no departamento "${targetDept.name}". Nenhuma transferência necessária.`,
      already_set: true
    });
  }
  
  // ... resto do código (update, log) ...
}
```

### Correção 4: Injetar Opções Disponíveis nas Descrições das Tools

**Conceito:** Antes de chamar a IA, buscar as opções reais do tenant e modificar dinamicamente as descrições das tools.

**Arquivo:** `supabase/functions/ai-chat/index.ts`

**Nova função para gerar tools com contexto:**

```typescript
async function getCrmToolsWithContext(supabase: any, lawFirmId: string) {
  // Buscar opções reais do tenant
  const [deptResult, statusResult, tagResult] = await Promise.all([
    supabase.from("departments").select("name").eq("law_firm_id", lawFirmId).eq("is_active", true),
    supabase.from("custom_statuses").select("name").eq("law_firm_id", lawFirmId).eq("is_active", true),
    supabase.from("tags").select("name").eq("law_firm_id", lawFirmId),
  ]);
  
  const depts = deptResult.data?.map((d: any) => d.name).join(", ") || "nenhum";
  const statuses = statusResult.data?.map((s: any) => s.name).join(", ") || "nenhum";
  const tags = tagResult.data?.map((t: any) => t.name).join(", ") || "nenhuma";
  
  return [
    {
      type: "function",
      function: {
        name: "transfer_to_department",
        description: `Transfere para outro departamento. DEPARTAMENTOS DISPONÍVEIS: ${depts}. Use APENAS estes nomes.`,
        parameters: {...}
      }
    },
    {
      type: "function",
      function: {
        name: "change_status",
        description: `Altera o status do cliente. STATUS DISPONÍVEIS: ${statuses}. Use APENAS estes nomes.`,
        parameters: {...}
      }
    },
    {
      type: "function",
      function: {
        name: "add_tag",
        description: `Adiciona uma tag EXISTENTE ao cliente. TAGS DISPONÍVEIS: ${tags}. NÃO CRIE novas tags.`,
        parameters: {...}
      }
    },
    // ... outros tools ...
  ];
}
```

**Uso:** Substituir a chamada de `getAllAvailableTools()` por `getCrmToolsWithContext()` para conversas WhatsApp.

---

## Detalhes Técnicos da Implementação

### Mudança 1: Bloquear Criação de Tags (Linhas ~628-698)

Remover completamente o bloco que cria tags:
```diff
- if (!tag) {
-   // Create new tag
-   const { data: newTag, error } = await supabase
-     .from("tags")
-     .insert({...})
-     .select()
-     .single();
-   if (error) { return... }
-   tag = newTag;
- }
+ if (!tag) {
+   const { data: allTags } = await supabase
+     .from("tags")
+     .select("name")
+     .eq("law_firm_id", lawFirmId);
+   const available = allTags?.map((t: any) => t.name).join(", ") || "nenhuma";
+   return JSON.stringify({ 
+     success: false, 
+     error: `Tag "${args.tag_name}" não existe. Disponíveis: ${available}`
+   });
+ }
```

### Mudança 2: Validar Status Atual (Linhas ~595-607)

Adicionar verificação após buscar o cliente atual:
```diff
  const fromStatus = (client?.custom_statuses as any)?.name || "Sem status";
  
+ // Skip if already in target status
+ if (client?.custom_status_id === targetStatus.id) {
+   return JSON.stringify({ 
+     success: true, 
+     message: `Cliente já está no status "${targetStatus.name}".`,
+     already_set: true
+   });
+ }
+ 
  // Update client status
  await supabase...
```

### Mudança 3: Validar Departamento Atual (Linhas ~493-518)

Adicionar verificação após encontrar o departamento:
```diff
  if (!targetDept) { return... }
  
+ // Check if already in this department
+ const { data: currentConv } = await supabase
+   .from("conversations")
+   .select("department_id")
+   .eq("id", conversationId)
+   .single();
+ 
+ if (currentConv?.department_id === targetDept.id) {
+   return JSON.stringify({ 
+     success: true, 
+     message: `Conversa já está no departamento "${targetDept.name}".`,
+     already_set: true
+   });
+ }
+ 
  // Update conversation...
```

### Mudança 4: Tools Dinâmicas com Contexto

Criar nova função `getCrmToolsWithContext()` e usá-la na linha ~3131:

```diff
- const tools = getAllAvailableTools(
-   true, // CRM tools
-   isSchedulingAgent,
-   true // Template tools
- );
+ // Get CRM tools with tenant-specific options injected
+ const crmToolsWithContext = await getCrmToolsWithContext(supabase, agentLawFirmId);
+ const tools = [
+   ...crmToolsWithContext,
+   ...(isSchedulingAgent ? SCHEDULING_TOOLS : []),
+   TEMPLATE_TOOL
+ ];
```

---

## Impacto e Riscos

| Componente | Impacto |
|------------|---------|
| Tags existentes | Não afetadas |
| Status existentes | Não afetados |
| Departamentos | Não afetados |
| Fluxo de IA | Melhorado (menos ações desnecessárias) |
| Performance | Mínimo (3 queries extras por conversa) |
| Funcionalidades existentes | Todas preservadas |

---

## Cronograma

1. **Imediato:** Corrigir validações (status, departamento, tags)
2. **Imediato:** Injetar opções disponíveis nas tools
3. **Após deploy:** Monitorar logs para verificar que ações desnecessárias pararam

---

## Resultado Esperado

```text
ANTES:
- IA cria tags inexistentes ❌
- IA muda status para o mesmo ❌
- IA transfere para mesmo departamento ❌
- IA não sabe as opções disponíveis ❌

DEPOIS:
- IA usa apenas tags existentes ✅
- IA ignora se status já é o desejado ✅
- IA ignora se já está no departamento ✅
- IA conhece todas as opções do tenant ✅
```
