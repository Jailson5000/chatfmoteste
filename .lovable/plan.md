
## Corrigir Exclusao de Instancia Bloqueada por Conflito de Unicidade

### Problema

Ao tentar excluir a instancia "MiauChat" (e8be455b), o sistema tenta definir `whatsapp_instance_id = NULL` em todos os clientes vinculados. Porem, existe um cliente "Gabrielle Martins" (telefone 556384017428) que ja possui um registro com `whatsapp_instance_id = NULL` na mesma law_firm. Isso viola o indice unico `idx_clients_phone_norm_law_firm_no_instance`, que impede dois clientes com o mesmo telefone e `whatsapp_instance_id IS NULL`.

### Dados do Problema

- Law firm: 8a6549cb (MIAUCHAT)
- Instancia "MIAU" (f3df33db) - conectada, mesmo numero
- Instancia "MiauChat" (e8be455b) - conectando, instancia duplicada
- Cliente conflitante: "Gabrielle Martins" (556384017428) existe com instance=NULL e com instance=MiauChat

### Correcao

**Arquivo: `supabase/functions/evolution-api/index.ts` (caso `delete_instance`)**

Antes de definir `whatsapp_instance_id = NULL`, o sistema deve:

1. Buscar outra instancia ativa da mesma law_firm para reatribuir os clientes
2. Se existir outra instancia, tentar mover os clientes para ela (ignorando conflitos de unicidade)
3. Para clientes que nao podem ser movidos (ja existem na instancia destino), simplesmente deleta-los (sao duplicatas)
4. Somente como fallback, tentar o comportamento atual de definir NULL

```text
// Dentro do case "delete_instance", ANTES de nullificar clientes:

// 1. Buscar outra instancia ativa na mesma law_firm
const { data: otherInstance } = await supabaseClient
  .from("whatsapp_instances")
  .select("id")
  .eq("law_firm_id", lawFirmId)
  .neq("id", body.instanceId)
  .limit(1)
  .single();

if (otherInstance) {
  // 2. Tentar mover clientes para a outra instancia
  // Primeiro, identificar clientes que JA existem na outra instancia (mesmo phone)
  // e deletar os duplicados da instancia sendo removida
  // Depois, mover os restantes
}

// 3. Para clientes que nao podem ser movidos, deletar conversations primeiro
//    e depois deletar o cliente duplicado

// 4. Fallback: tentar NULL com tratamento de erro
```

A logica detalhada:

- Buscar todos os clientes da instancia a ser deletada
- Para cada cliente, verificar se ja existe um com mesmo telefone na instancia destino ou com NULL
- Se existe duplicata: mover conversas para o cliente existente e deletar o duplicado
- Se nao existe: reatribuir para a outra instancia (ou NULL se nao houver outra)

### Detalhes Tecnicos

O codigo na edge function `evolution-api/index.ts` (linhas 1030-1049) sera substituido por uma logica mais robusta que:

1. Usa uma query SQL para identificar conflitos ANTES de tentar o update
2. Resolve conflitos por merge (mover conversas + deletar duplicata)
3. Move clientes restantes para outra instancia ativa, se existir
4. Somente define NULL como ultimo recurso, e trata o erro 23505 graciosamente

Isso resolve tanto o caso imediato (MiauChat) quanto previne o problema para qualquer exclusao futura de instancias com clientes duplicados.
