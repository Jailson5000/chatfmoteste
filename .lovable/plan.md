

## Diagnostico Completo: Mensagens Falham + Status Travado

### O que os logs revelam

1. **As instancias WhatsApp estao GENUINAMENTE desconectadas na Evolution API** - o `refresh_status` consulta diretamente a Evolution API e retorna `connecting` ou `disconnected` para TODAS as instancias. Nenhuma esta `open`.

2. **Envio de mensagem falha com "Connection Closed"** - quando a plataforma tenta enviar via Evolution API, o servidor retorna erro 400 "Connection Closed", confirmando que a sessao WhatsApp esta morta.

3. **Apos a falha de envio, o status muda para `disconnected`** - o codigo detecta "Connection Closed" e marca a instancia como desconectada no banco (linha 1914-1924), o que faz aparecer o banner vermelho "WhatsApp desconectado" no chat.

4. **Duas instancias nao existem mais na Evolution API** - `inst_n5572v68` e `inst_s10r2qh8` retornaram 404 ao reaplicar webhooks.

5. **Nenhum evento `messages.upsert` chegou** - zero logs de mensagens recebidas, confirmando que o bot nao recebe mensagens.

### Causa raiz

As sessoes WhatsApp (Baileys) dentro da Evolution API perderam a conexao. Isso pode ter ocorrido por:
- Atualizacao da versao do WhatsApp Web (confirmado: v2.3000.1033105955)
- Restart do container Docker sem persistencia de sessao
- Sessoes expiradas

### Problema no codigo: Botao "Reconectar" no chat NAO reconecta

O botao "Reconectar" na tela de conversas chama `refresh_status` (apenas verifica o status), nao tenta gerar QR code. Se o status nao voltar como `connected`, redireciona para `/connections`. Isso e confuso para o usuario -- ele espera que o botao RECONECTE, nao apenas verifique.

### Correcoes planejadas

**Correcao 1: Botao "Reconectar" no chat deve tentar reconexao real**

Arquivo: `src/pages/Conversations.tsx` (linha ~4414)

Ao inves de apenas chamar `refresh_status`, o botao deve:
1. Primeiro chamar `refresh_status` para verificar se ja esta conectado
2. Se nao estiver conectado, chamar `get_qrcode` (que chama `/instance/connect/` na Evolution API)
3. Se retornar QR code, redirecionar para `/connections` com parametro para abrir o dialog de QR automaticamente
4. Se retornar "connected", atualizar o status e fechar o banner

**Correcao 2: Redirecionar para Connections com auto-open do QR dialog**

Arquivo: `src/pages/Connections.tsx`

Adicionar suporte a query parameter `?reconnect=INSTANCE_ID` que automaticamente abre o dialog de QR code para a instancia especificada ao carregar a pagina.

**Correcao 3: Instancias 404 devem ser marcadas no banco**

Arquivo: `src/hooks/useGlobalAdminInstances.tsx`

Quando o `reapplyAllWebhooks` receber 404 para uma instancia, marcar o status como `not_found_in_evolution` no banco para que o usuario saiba que a instancia precisa ser recriada.

### Detalhes tecnicos

**Arquivo 1: `src/pages/Conversations.tsx`** (botao Reconectar ~linha 4414)

```text
// Mudanca: tentar reconexao real antes de redirecionar
onClick={async () => {
  setIsReconnecting(true);
  try {
    // 1. Verificar status atual
    const { data, error } = await supabase.functions.invoke("evolution-api", {
      body: { action: "refresh_status", instanceId: instanceDisconnectedInfo.instanceId }
    });
    if (!error && data?.status === "connected") {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "WhatsApp reconectado com sucesso!" });
      return;
    }
    
    // 2. Se nao conectado, redirecionar para Connections com auto-reconnect
    navigate(`/connections?reconnect=${instanceDisconnectedInfo.instanceId}`);
  } catch {
    navigate(`/connections?reconnect=${instanceDisconnectedInfo.instanceId}`);
  } finally {
    setIsReconnecting(false);
  }
}}
```

**Arquivo 2: `src/pages/Connections.tsx`** (auto-open QR dialog)

```text
// Adicionar no inicio do componente:
const [searchParams] = useSearchParams();
const reconnectId = searchParams.get("reconnect");

// useEffect para auto-abrir QR dialog
useEffect(() => {
  if (reconnectId && instances.length > 0) {
    const instance = instances.find(i => i.id === reconnectId);
    if (instance && instance.status !== "connected") {
      handleConnectInstance(instance);
    }
    // Limpar o parametro da URL
    navigate("/connections", { replace: true });
  }
}, [reconnectId, instances]);
```

**Arquivo 3: `src/hooks/useGlobalAdminInstances.tsx`** (marcar 404 no banco)

```text
// No loop do reapplyAllWebhooks, quando error contiver 404:
if (error || !data?.success) {
  const errorMsg = error?.message || data?.error || "";
  // Se a instancia nao existe na Evolution API, marcar no banco
  if (errorMsg.includes("404") || errorMsg.includes("does not exist")) {
    await supabase
      .from("whatsapp_instances")
      .update({ status: "not_found_in_evolution", updated_at: new Date().toISOString() })
      .eq("id", instance.id);
  }
  failed++;
}
```

### Acao imediata necessaria (fora do codigo)

Para restaurar as conexoes WhatsApp, e necessario ir na pagina de **Conexoes** da plataforma e clicar em **"Conectar"** no menu de cada instancia para gerar o QR code e escanear com o celular. As sessoes estao genuinamente desconectadas na Evolution API.

Se o QR code nao for gerado, pode ser necessario reiniciar o container da Evolution API:
```text
docker restart evolution
```

### Resultado esperado

1. O botao "Reconectar" no chat redireciona automaticamente para a pagina de Conexoes e abre o dialog de QR
2. O usuario escaneia o QR code e a instancia volta a funcionar
3. Instancias que nao existem mais na Evolution API sao marcadas claramente
4. Mensagens voltam a ser enviadas e recebidas apos a reconexao
