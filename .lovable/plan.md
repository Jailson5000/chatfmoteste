

## Correcao Critica: Mensagens Nao Chegam + Status Travado em "Conectando"

### Diagnostico Definitivo

Apos analise profunda dos logs e do codigo, foram identificados 3 problemas interligados:

**Problema 1 - Mensagens nao chegam**: O botao "Reaplicar Webhooks" NUNCA foi executado com sucesso (nao ha logs de `global_configure_webhook`). A configuracao de webhook no lado da Evolution API pode estar incompleta, sem incluir o evento `MESSAGES_UPSERT`. Por isso, apesar dos eventos de `connection.update` chegarem, nenhum evento de mensagem e recebido.

**Problema 2 - Status fica travado em "connecting"**: Existe uma condicao de corrida (race condition) no webhook handler. O `sync-evolution-instances` atualiza o status para `connected`, mas milissegundos depois, um evento `connecting` chega via webhook, le o status antigo do banco e sobrescreve de volta para `connecting`. O codigo existente que ignora `connecting` quando status e `connected` (linha 4146) nao protege contra este cenario de timing.

**Problema 3 - Bug no updatePayload**: No handler de `connection.update`, quando o estado e `close`, o codigo tenta acessar `updatePayload` na linha 4163 antes de ser declarado na linha 4170. Isso causa um ReferenceError (temporal dead zone) e impede o processamento correto de desconexoes.

### Correcoes Planejadas

**Arquivo 1: `supabase/functions/evolution-webhook/index.ts`**

Correcao A - Mover declaracao de `updatePayload` para ANTES do switch de estados (antes da linha 4130):
```text
// Mover de linha 4170 para antes da linha 4130
const updatePayload: Record<string, unknown> = { 
  updated_at: new Date().toISOString() 
};
// O campo 'status' sera adicionado ao final do switch
```

Correcao B - Proteger contra race condition na atualizacao de `connecting`:
Na linha 4274, quando `dbStatus === 'connecting'`, adicionar `.neq('status', 'connected')` para que o UPDATE so aconteca se o status atual nao for `connected`:
```text
// Linha 4274 - Atualizar de:
const { error: updateError } = await supabaseClient
  .from('whatsapp_instances')
  .update(updatePayload)
  .eq('id', instance.id);

// Para (quando dbStatus === 'connecting'):
let updateQuery = supabaseClient
  .from('whatsapp_instances')
  .update(updatePayload)
  .eq('id', instance.id);
  
// Nao permitir downgrade de 'connected' para 'connecting'
if (dbStatus === 'connecting') {
  updateQuery = updateQuery.neq('status', 'connected');
}

const { error: updateError } = await updateQuery;
```

**Arquivo 2: `src/hooks/useGlobalAdminInstances.tsx`**

Correcao C - Incluir TODOS os status no filtro de reaplicacao e chamar sync apos:
```text
// Linha 465 - Mudar de:
const connectedInstances = instances.filter((i) => 
  ["connected", "connecting"].includes(i.status));

// Para:
const targetInstances = instances.filter((i) => 
  !["not_found_in_evolution"].includes(i.status));
```

Correcao D - Apos reaplicar webhooks, chamar `sync-evolution-instances` para forcar sincronizacao de status:
```text
// No onSuccess (linha 494), apos o toast:
queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });

// Chamar sync apos 3 segundos (tempo para Evolution API processar os webhooks)
setTimeout(async () => {
  await supabase.functions.invoke("sync-evolution-instances");
  queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
}, 3000);
```

### Sequencia de execucao

1. Corrigir o bug do `updatePayload` (temporal dead zone)
2. Adicionar protecao contra race condition no UPDATE
3. Atualizar filtro e adicionar sync automatico no reapply
4. Fazer deploy da edge function `evolution-webhook`
5. Fazer deploy da edge function `evolution-api` (se necessario)

### Resultado esperado

1. Ao clicar "Reaplicar Webhooks", TODAS as instancias terao seus webhooks configurados com a URL correta (com token) e com TODOS os eventos (incluindo MESSAGES_UPSERT)
2. Apos reaplicacao, o sync automatico atualizara os status para `connected`
3. A protecao contra race condition impedira que eventos `connecting` sobrescrevam o status `connected`
4. Mensagens voltarao a chegar pelo webhook
5. O bot voltara a responder normalmente

