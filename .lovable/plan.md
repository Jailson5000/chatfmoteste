

## Remover Movimentacao Automatica e Mostrar Aviso ao Abrir Conversa

### Problema

Quando uma instancia eh excluida, o sistema move automaticamente os clientes para outra instancia ou seta NULL. O comportamento desejado eh:

1. **Nao mover automaticamente** - apenas setar NULL e guardar a referencia em `last_whatsapp_instance_id`
2. **Ao abrir a conversa**, mostrar um banner informando que o cliente estava em uma instancia excluida
3. **Dar a opcao de mover** para outra instancia ativa, usando o mesmo fluxo de transferencia de instancia ja existente

### Correcoes

**1. Edge Function `evolution-api/index.ts` - Simplificar `delete_instance`**

Remover toda a logica de "smart reassignment" (linhas ~1030-1220) que faz merge automatico de clientes e conversas. Substituir por uma logica simples:

- Setar `whatsapp_instance_id = NULL` e `last_whatsapp_instance_id = instanceId` nos clientes
- Setar `whatsapp_instance_id = NULL` e `last_whatsapp_instance_id = instanceId` nas conversas
- Tratar o erro de unicidade (23505) graciosamente: se um cliente ja existe com NULL, simplesmente pular (nao falhar a exclusao inteira)
- A estrategia: usar SQL direto via RPC ou tratar erros individualmente

Para resolver o conflito de unicidade ao setar NULL, a abordagem sera:
- Tentar o update em batch
- Se falhar com erro 23505, processar cliente por cliente: para cada conflito, manter o cliente existente e mover as conversas do duplicado para ele, depois deletar o duplicado
- Isso so acontece para o caso especifico de clientes duplicados (mesmo telefone com NULL)

**2. Frontend `Conversations.tsx` - Melhorar o banner de instancia excluida**

O banner atual (linha ~4440) ja detecta quando `instanceDisconnectedInfo.deleted === true`, mas:

- Atualmente so mostra texto: "WhatsApp sem conexao. A conexao foi excluida ou desvinculada."
- **Mudar** para mostrar um banner amarelo/laranja (nao vermelho) com a mensagem: "Este cliente estava vinculado a uma conexao que foi excluida. Selecione outra conexao para continuar."
- **Adicionar um Select** (dropdown) com as instancias ativas disponiveis, usando o mesmo mecanismo de `changeWhatsAppInstance.mutate()` que ja existe no header
- Quando o usuario selecionar uma instancia, disparar a mesma logica de transferencia (com verificacao de conflito)

**3. Frontend - Garantir que o Select de instancia no header funciona para conversas orfas**

O select de instancia no header (linha ~3942) ja aparece quando `instanceDisconnectedInfo` existe. O valor atual sera vazio ("") quando `whatsapp_instance_id` eh NULL, entao o usuario ja pode selecionar uma nova instancia por ali tambem. Verificar que isso funciona corretamente.

### Detalhes Tecnicos

**Edge Function (`supabase/functions/evolution-api/index.ts`):**

Substituir linhas ~1030-1220 (toda a logica de smart reassignment) por:

```text
// Simple approach: set NULL with last_whatsapp_instance_id tracking
// Handle uniqueness conflicts by merging only conflicting records

// 1. Try batch update for clients
const { error: clientsError } = await supabaseClient
  .from("clients")
  .update({ 
    whatsapp_instance_id: null, 
    last_whatsapp_instance_id: body.instanceId 
  })
  .eq("whatsapp_instance_id", body.instanceId)
  .eq("law_firm_id", lawFirmId);

if (clientsError?.code === "23505") {
  // Uniqueness conflict - process individually
  // Fetch clients, for each one that conflicts:
  // - Find existing client with same phone + NULL instance
  // - Move conversations/tags/actions to existing client
  // - Delete the duplicate
  // - Then retry the batch update
}

// 2. Same for conversations
const { error: convsError } = await supabaseClient
  .from("conversations")
  .update({
    whatsapp_instance_id: null,
    last_whatsapp_instance_id: body.instanceId
  })
  .eq("whatsapp_instance_id", body.instanceId)
  .eq("law_firm_id", lawFirmId);

// Handle conversation conflicts similarly
```

**Frontend (`src/pages/Conversations.tsx`):**

No banner de instancia excluida (~linha 4440), adicionar um Select dropdown:

```text
// Change from red banner to amber/warning banner
// Add instance selector dropdown
{instanceDisconnectedInfo?.deleted && (
  <div className="... bg-amber-500/10 text-amber-600 ...">
    <span>
      <AlertTriangle />
      Este cliente estava em uma conexao excluida. Selecione outra:
    </span>
    <Select onValueChange={(value) => {
      // Use same changeWhatsAppInstance logic
      // Check for conflicts, show dialog if needed
    }}>
      {whatsappInstances
        .filter(i => i.status === 'connected')
        .map(inst => <SelectItem .../>)}
    </Select>
  </div>
)}
```

### Resumo

- Edge function: simplificar para apenas NULL + tracking (sem mover automatico)
- Frontend: banner amarelo com dropdown para escolher instancia manualmente
- Reutilizar toda a logica de transferencia de instancia ja existente
- Conflitos de unicidade tratados apenas no caso de duplicatas reais (merge + delete)
