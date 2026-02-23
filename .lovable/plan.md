
## Corrigir: Sessoes Corrompidas no Evolution - QR Code Nao Aparece

### Diagnostico Comprovado

**Evidencia direta dos logs:**
```
/instance/connect raw response for inst_0gkejsc5: {"count":0}
/instance/connect raw response for inst_7sw6k99c: {"count":0}
/instance/connect raw response for inst_ea9bfhx3: {"count":0}
```

A resposta `{"count":0}` do endpoint `/instance/connect` e invalida - nao contem QR code, nao contem estado. Isso significa que a sessao Baileys esta corrompida internamente no servidor Evolution.

**Confirmacao visual:** A screenshot do usuario mostra que MESMO no painel do Evolution, ao clicar "Get QR Code" na instancia "TESTE INTERNO MIAU", o QR nao aparece - apenas a mensagem "Scan the QR code with your WhatsApp Web" sem imagem.

**Logout tambem falha:**
```
Logout response for inst_ea9bfhx3: 500
Logout response for inst_7sw6k99c: 400
Logout response for inst_464pnw5n: 400
```

### Causa Raiz

As sessoes Baileys estao num estado corrompido onde:
- `fetchInstances` reporta "open" (registro existe)
- `connectionState` reporta "close" (socket morto)
- `/instance/connect` retorna `{"count":0}` (nao consegue gerar QR)
- `/instance/logout` retorna 400/500 (nao consegue limpar)

A UNICA forma de resolver e **deletar a instancia no Evolution e recriar do zero**, forcando um novo registro Baileys.

### Solucao: Auto-Recuperacao via Delete + Recreate

**Arquivo: `supabase/functions/evolution-api/index.ts`**

1. Na acao `get_qrcode` (linha ~818): Apos receber a resposta de `/instance/connect`, detectar a resposta invalida `{"count":0}` (sem QR code E sem estado valido). Quando detectada:
   - Chamar `DELETE /instance/delete/{instanceName}` para remover a instancia corrompida
   - Chamar `POST /instance/create` para recriar com QR code habilitado
   - Configurar webhook e settings (groupsIgnore)
   - Retornar o QR code da nova instancia

   Isso reutiliza a mesma logica que ja existe para o caso `404` (linhas 729-810), expandindo para cobrir tambem respostas invalidas.

2. No `auto-reconnect-instances/index.ts`: Quando `/instance/connect` retorna `{"count":0}` durante tentativa de reconexao de ghost session, aplicar a mesma estrategia - deletar e recriar a instancia, ao inves de apenas marcar como "connecting" e esperar.

### Mudancas Tecnicas Detalhadas

**Arquivo 1: `supabase/functions/evolution-api/index.ts`**

Na acao `get_qrcode`, apos a linha 818 (parse da resposta):
- Verificar se `qrCode === null` E `status` nao e "open"/"connected" E a resposta contem `{"count":0}` ou corpo vazio
- Se verdadeiro, executar o fluxo de recuperacao:

```text
// Pseudocodigo:
if (!qrCode && status !== "open" && status !== "connected") {
  // Sessao corrompida - deletar e recriar
  console.log("Corrupted session detected, deleting and recreating...");
  
  // 1. Deletar instancia no Evolution
  await fetch(`${apiUrl}/instance/delete/${instanceName}`, { method: "DELETE" });
  await sleep(2000);
  
  // 2. Recriar instancia
  const createResp = await fetch(`${apiUrl}/instance/create`, {
    body: { instanceName, qrcode: true, webhook: buildWebhookConfig(WEBHOOK_URL) }
  });
  
  // 3. Configurar settings (groupsIgnore)
  await fetch(`${apiUrl}/settings/set/${instanceName}`, { body: settingsPayload });
  
  // 4. Extrair QR code da resposta de criacao
  qrCode = createResp.qrcode.base64;
}
```

**Arquivo 2: `supabase/functions/auto-reconnect-instances/index.ts`**

Na secao de ghost session handling, apos `/instance/connect` retornar `{"count":0}`:
- Detectar resposta invalida (sem QR, sem estado)
- Executar delete + recreate ao inves de simplesmente registrar o resultado
- Manter o mesmo `instance_name` e `api_key` no banco de dados

### Fluxo Corrigido

```text
Usuario clica "Reconectar" ou "Obter QR Code"
  |
  v
/instance/connect retorna {"count":0}?
  |
  SIM -> Sessao corrompida detectada
  |       |
  |       v
  |     DELETE /instance/delete/{name}  (remove registro corrompido)
  |       |
  |       v
  |     POST /instance/create  (cria nova instancia limpa)
  |       |
  |       v
  |     QR code gerado com sucesso -> retorna para o usuario
  |
  NAO -> QR code valido? -> Exibir para o usuario
         Ja conectado? -> Atualizar status
```

### Impacto Esperado

| Antes | Depois |
|---|---|
| QR code nunca aparece ({"count":0}) | Instancia recriada automaticamente com QR valido |
| Sessoes corrompidas ficam presas para sempre | Auto-recuperacao via delete+recreate |
| Usuario precisa ir no painel Evolution manualmente | Tudo resolvido pela plataforma automaticamente |
| Auto-reconnect nao consegue recuperar | Auto-reconnect deleta e recria quando necessario |

### Arquivos Editados

1. `supabase/functions/evolution-api/index.ts` - Detectar resposta `{"count":0}` no get_qrcode e executar delete+recreate automatico
2. `supabase/functions/auto-reconnect-instances/index.ts` - Detectar resposta invalida no ghost session e executar delete+recreate
