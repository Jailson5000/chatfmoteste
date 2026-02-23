

## Correcao: Restaurar Webhooks e Fluxo de Mensagens

### Diagnostico Final

A versao da Evolution API (v2.3.7) NAO e o problema. A causa raiz e que os webhooks configurados nas instancias da Evolution API estao com a URL errada (sem token de autenticacao), resultando em:

1. ZERO eventos `messages.upsert` chegando na plataforma (mensagens nao sao recebidas)
2. Eventos `connection.update` com `state: open` sendo rejeitados (status fica travado em "connecting")
3. Chamadas da plataforma retornando "Invalid authorization token" (sessao JWT expirada)

### O que esta acontecendo nas instancias

| Instancia | Evolution API | Banco de Dados | Problema |
|-----------|--------------|----------------|----------|
| inst_ea9bfhx3 | Connected | connected | OK |
| inst_0gkejsc5 | Connected | connected | OK |
| inst_464pnw5n | Connected | connected | OK |
| inst_d92ekkep | Connected | connecting | Webhook sem token |
| inst_l26f156k | Connected | connecting | Webhook sem token |
| inst_5fjooku6 | Connected | connecting | Webhook sem token |
| inst_n5572v68 | Connected* | connecting | Webhook sem token |
| inst_dxxw3z8c | Connecting | connecting | Instancia nao conectada |

### Plano de Correcao

**1. Adicionar endpoint de verificacao de webhook na edge function `evolution-api`**

Nova action `verify_webhook_config` que consulta a Evolution API para verificar qual URL de webhook esta configurada em cada instancia, facilitando diagnostico.

**2. Corrigir a funcao `global_configure_webhook` para lidar com formatos de API diferentes**

A Evolution API v2.3.x usa o endpoint `PUT /webhook/set/{instance}` com um formato especifico. O codigo atual tenta dois formatos (com e sem wrapper `{webhook: ...}`), mas pode estar falhando silenciosamente. Adicionar logs detalhados da resposta e tentativa com o endpoint alternativo `POST /webhook/set/{instance}`.

**3. Criar action `global_force_sync_all` que combina reaplicar webhooks + sync status**

Uma unica action que:
- Para cada instancia: configura webhook com URL correta (com token)
- Verifica resposta da Evolution API e loga se falhou
- Apos configurar todos, chama `sync-evolution-instances` para atualizar status
- Retorna relatorio detalhado de sucesso/falha por instancia

**4. Adicionar botao "Forcar Sincronizacao Completa" no painel Global Admin**

No `useGlobalAdminInstances.tsx`, adicionar uma mutation que chama a nova action `global_force_sync_all`, mostrando progresso e resultado.

### Detalhes Tecnicos

**Arquivo 1: `supabase/functions/evolution-api/index.ts`**

Adicionar nova action `verify_webhook_config` (apos o case `global_configure_webhook`):

```typescript
case "verify_webhook_config": {
  // Buscar config atual do webhook na Evolution API
  const response = await fetch(
    `${apiUrl}/webhook/find/${instanceName}`,
    { headers: { apikey: globalApiKey } }
  );
  const config = await response.json();
  return { success: true, webhook_config: config };
}
```

Modificar `global_configure_webhook` para incluir logs detalhados:

```typescript
// Apos cada tentativa de configuracao, logar a resposta completa
const responseText = await webhookResponse.text();
console.log(`[Evolution API] Webhook config response for ${instanceName}:`, {
  status: webhookResponse.status,
  body: responseText.slice(0, 500)
});
```

**Arquivo 2: `src/hooks/useGlobalAdminInstances.tsx`**

Adicionar funcao `forceSyncAll` que:
1. Busca todas as instancias do banco
2. Para cada uma, chama `global_configure_webhook` via edge function
3. Espera 2 segundos
4. Chama `sync-evolution-instances` para atualizar status
5. Invalida queries para refrescar a UI

```typescript
const forceSyncAll = useMutation({
  mutationFn: async () => {
    const results = [];
    for (const instance of instances) {
      if (instance.status === 'not_found_in_evolution') continue;
      
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "global_configure_webhook",
          instanceName: instance.instance_name,
          instanceId: instance.id,
        }
      });
      
      results.push({
        instance: instance.instance_name,
        success: !error && data?.success,
        error: error?.message || data?.error
      });
    }
    
    // Aguardar e sincronizar
    await new Promise(r => setTimeout(r, 3000));
    await supabase.functions.invoke("sync-evolution-instances");
    
    return results;
  },
  onSuccess: (results) => {
    queryClient.invalidateQueries({ queryKey: ["global-admin-instances"] });
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    toast({
      title: "Sincronizacao completa",
      description: `${succeeded} OK, ${failed} falhas`
    });
  }
});
```

**Arquivo 3: `src/pages/global-admin/GlobalAdminConnections.tsx`**

Adicionar botao "Forcar Sync Completo" ao lado do botao existente "Reaplicar Webhooks".

### Sequencia de execucao

1. Adicionar logs detalhados no `global_configure_webhook`
2. Adicionar action `verify_webhook_config`
3. Criar mutation `forceSyncAll` no hook
4. Adicionar botao na UI do Global Admin
5. Deploy da edge function `evolution-api`
6. Testar clicando no novo botao

### Resultado esperado

1. Botao "Forcar Sync Completo" reconfigura TODOS os webhooks com a URL correta (com token)
2. Sync automatico atualiza os status para `connected` onde a Evolution API confirma
3. Eventos `messages.upsert` comecam a chegar com autenticacao valida
4. Bot volta a receber e responder mensagens
5. Log detalhado mostra exatamente quais instancias falharam e por que

