

## Correcao: API "Business Asset User Profile Access" - Nome e Foto do Facebook

### Problema
A API do Graph (`graph.facebook.com/{PSID}?fields=first_name,last_name,profile_pic`) so e chamada quando `clientNeedsNameUpdate = true`, o que acontece apenas para clientes novos ou com nomes genericos (ex: "FACEBOOK 3282"). Clientes que ja tiveram o nome resolvido via fallback `mid` (que nao retorna foto) nunca disparam a chamada PSID, resultando em:
- Avatares ausentes para contatos como "Joyce Martins"
- Meta Dashboard mostrando 0 chamadas a API
- Rejeicao da permissao no App Review

### Solucao
Expandir a condicao para tambem chamar a API quando o cliente nao tem avatar (`avatar_url` ausente).

### Alteracoes no arquivo `supabase/functions/meta-webhook/index.ts`

**1. Buscar `avatar_url` na query do cliente existente (linha 404)**
- De: `.select("id, name")`
- Para: `.select("id, name, avatar_url")`

**2. Expandir condicao para incluir avatar ausente (linha 413)**
- De: `if (genericPattern.test(existingClient.name?.trim() || ""))`
- Para: `if (genericPattern.test(existingClient.name?.trim() || "") || !existingClient.avatar_url)`

**3. Proteger nomes validos ao atualizar (linhas 528-534)**
Quando o cliente ja tem um nome real (nao generico), nao sobrescrever o nome -- apenas atualizar o avatar:
```
if (resolvedName || avatarUrl) {
  const updateData: Record<string, any> = {};
  const genericPattern = /^(INSTAGRAM|FACEBOOK|WHATSAPP_CLOUD)\s+\w{2,6}$/i;
  // So atualizar nome se for generico/vazio ou se e cliente novo
  if (resolvedName && (!existingClient?.name || genericPattern.test(existingClient.name.trim()))) {
    updateData.name = resolvedName;
  }
  if (avatarUrl) updateData.avatar_url = avatarUrl;
  if (Object.keys(updateData).length > 0) {
    await supabase.from("clients").update(updateData).eq("id", clientId);
  }
}
```

### Resultado esperado
- Na proxima mensagem de qualquer contato Facebook sem avatar, a API PSID sera chamada
- A foto sera baixada e persistida no bucket `chat-media`
- O nome existente (ex: "Joyce Martins") sera preservado
- O dashboard da Meta registrara as chamadas a API
- O screencast podera mostrar o avatar aparecendo na interface

### Risco
Baixo. A unica mudanca e expandir uma condicao `if` para tambem disparar quando `avatar_url` e null. Para clientes que ja tem avatar, nada muda.

