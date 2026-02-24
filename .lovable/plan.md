

# Continuar Integração Dual-Provider (uazapi) - Fase 2

## Resumo

A Fase 1 criou a migration SQL, o modulo de abstracao `_shared/whatsapp-provider.ts`, o webhook `uazapi-webhook`, e o dialog `NewInstanceDialog` com selector de provider. Agora precisamos conectar tudo: o frontend precisa passar os dados do provider para o hook, o hook para a edge function, e a edge function precisa usar a camada de abstracao para criar instancias uazapi.

## O que sera feito

### 1. Atualizar `Connections.tsx` - handleCreateInstance

A funcao `handleCreateInstance` atualmente aceita apenas `(displayName, instanceName)`. Precisa aceitar os parametros extras do provider:

```
handleCreateInstance(displayName, instanceName, provider?, uazapiUrl?, uazapiToken?)
```

Quando `provider === "uazapi"`:
- Passa `uazapiUrl` como `apiUrl` e `uazapiToken` como `apiKey` para o hook
- Passa `provider: "uazapi"` para o hook

### 2. Atualizar `useWhatsAppInstances.tsx` - CreateInstanceParams

Adicionar campo `provider` ao `CreateInstanceParams`:

```typescript
interface CreateInstanceParams {
  instanceName: string;
  displayName: string;
  apiUrl?: string;
  apiKey?: string;
  provider?: 'evolution' | 'uazapi';  // NOVO
}
```

No `createInstance.mutationFn`, passar `provider` no body da requisicao para a edge function.

### 3. Atualizar `evolution-api/index.ts` - case "create_instance"

Modificar o case `create_instance` para:
1. Verificar se `body.provider === "uazapi"`
2. Se uazapi: Usar o `UazapiProvider.createInstance()` do modulo compartilhado
3. Se evolution (ou sem provider): Manter logica existente
4. Gravar `api_provider: body.provider || 'evolution'` no INSERT do banco

### 4. Atualizar actions que buscam instancia (get_qrcode, get_status, send_message, etc.)

Para cada action que chama `getInstanceById` e depois faz requests HTTP diretos:
- Verificar `instance.api_provider`
- Se `uazapi`: delegar para `UazapiProvider` do modulo compartilhado
- Se `evolution`: manter logica existente

As actions prioritarias (mais usadas) sao:
- `get_qrcode` - conectar instancia
- `get_status` / `refresh_status` - verificar conexao
- `refresh_phone` - buscar numero conectado
- `send_message` / `send_message_async` - enviar texto
- `send_media` / `send_media_async` - enviar midia
- `configure_webhook` - configurar webhook
- `delete_instance` - remover instancia
- `logout_instance` - desconectar
- `get_settings` / `set_settings` - configuracoes de rejeicao de chamada

### 5. Adicionar badge de provider na tabela de conexoes

Na tabela em `Connections.tsx`, exibir um badge pequeno indicando o provider de cada instancia (ex: "EVO" ou "UAZAPI") ao lado do nome/ID.

## Detalhes Tecnicos

### Conexao Frontend -> Edge Function

```text
NewInstanceDialog (provider=uazapi, subdomain, token)
    |
    v
Connections.tsx handleCreateInstance(name, id, "uazapi", url, token)
    |
    v
useWhatsAppInstances.createInstance({ ..., provider: "uazapi", apiUrl, apiKey })
    |
    v
evolution-api edge function (body.provider === "uazapi")
    |
    v
UazapiProvider.connect(config) -> QR code
    + INSERT whatsapp_instances (api_provider: "uazapi")
```

### Deteccao de provider nas actions existentes

Apos buscar instancia com `getInstanceById()`, checar `instance.api_provider`:

```typescript
const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId);
const providerConfig = {
  provider: instance.api_provider || 'evolution',
  apiUrl: instance.api_url,
  apiKey: instance.api_key,
  instanceName: instance.instance_name,
};

if (instance.api_provider === 'uazapi') {
  // Delegar para UazapiProvider
  const result = await UazapiProvider.connect(providerConfig);
  // ...
} else {
  // Manter logica Evolution existente
  // ...
}
```

### Actions com tratamento especial para uazapi

- `get_settings` / `set_settings`: uazapi nao tem equivalente de rejectCall. Retornar valor padrao e ignorar set.
- `get_media`: uazapi envia midia como base64 inline no webhook, nao precisa de endpoint separado.
- `fetch_profile_picture`: usar endpoint uazapi `/contacts/profile-picture`.

### Webhook uazapi

O webhook `uazapi-webhook/index.ts` ja foi criado na Fase 1 e esta pronto para receber eventos.

## Ordem de implementacao

1. Atualizar `CreateInstanceParams` no hook
2. Atualizar `handleCreateInstance` em `Connections.tsx`
3. Modificar `create_instance` na edge function
4. Adicionar provider detection nas actions `get_qrcode`, `get_status`, `refresh_status`, `refresh_phone`
5. Adicionar provider detection nas actions `send_message`, `send_media`
6. Adicionar provider detection nas actions `configure_webhook`, `delete_instance`, `logout_instance`
7. Adicionar provider detection em `get_settings`/`set_settings`
8. Adicionar badge de provider na UI
