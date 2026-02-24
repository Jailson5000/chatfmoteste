
# Corrigir botoes para instancias uazapi

## Problema

Dois actions no backend (`evolution-api/index.ts`) nao tem tratamento para o provedor uazapi, fazendo com que chamem endpoints da Evolution API diretamente -- resultando em erro para instancias uazapi:

1. **`refresh_phone`** (botao "Atualizar numero"): Usa `fetchPhoneNumberEnhanced()` que chama endpoints da Evolution API. Para uazapi, precisa usar o provider pattern.
2. **`logout_instance`** (botao "Desconectar"): Chama diretamente `{apiUrl}/instance/logout/{instanceName}` da Evolution. Para uazapi, precisa usar `provider.disconnect()`.

Os botoes do dropdown ("Conectar", "Atualizar status", "Excluir") ja funcionam corretamente pois os respectivos cases (`get_qrcode`, `refresh_status`, `delete_instance`) ja tem bloco `if (isUazapi(instance))`.

## Solucao

### Arquivo: `supabase/functions/evolution-api/index.ts`

**1. `refresh_phone` (linha ~2305):** Adicionar bloco uazapi antes do codigo Evolution:

```typescript
// UAZAPI PROVIDER
if (isUazapi(instance)) {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  const statusResult = await provider.getStatus(config);
  const phoneNumber = statusResult.phoneNumber || null;

  if (phoneNumber) {
    // Check duplicate
    const duplicate = await checkPhoneNumberDuplicate(supabaseClient, phoneNumber, body.instanceId);
    if (duplicate) { /* return 409 error */ }

    await supabaseClient.from("whatsapp_instances")
      .update({ phone_number: phoneNumber, updated_at: new Date().toISOString() })
      .eq("id", body.instanceId);
  }

  return Response({ success: true, phoneNumber });
}
```

**2. `logout_instance` (linha ~2430):** Adicionar bloco uazapi antes do codigo Evolution:

```typescript
// UAZAPI PROVIDER
if (isUazapi(instance)) {
  const config = getProviderConfig(instance);
  const provider = getProvider(config);
  await provider.disconnect(config);

  const { data: updatedInstance } = await supabaseClient.from("whatsapp_instances")
    .update({ status: "disconnected", manual_disconnect: true, updated_at: new Date().toISOString() })
    .eq("id", body.instanceId).eq("law_firm_id", lawFirmId).select().single();

  return Response({ success: true, message: "Instance disconnected", instance: updatedInstance });
}
```

## Resumo

| Acao | Status Atual | Correcao |
|---|---|---|
| `get_qrcode` (Conectar) | Funciona | Nenhuma |
| `refresh_status` (Atualizar status) | Funciona | Nenhuma |
| `delete_instance` (Excluir) | Funciona | Nenhuma |
| `configure_webhook` | Funciona | Nenhuma |
| `refresh_phone` (Atualizar numero) | Chama Evolution API | Adicionar bloco uazapi |
| `logout_instance` (Desconectar) | Chama Evolution API | Adicionar bloco uazapi |

Apenas 1 arquivo alterado: `supabase/functions/evolution-api/index.ts` (2 blocos adicionados).
