

# Plano: Melhorias nas Conexoes e Pausa do Evolution API

## 1. Mostrar ultimos 4 digitos do telefone como badge

Na pagina de Conexoes do tenant (`Connections.tsx`), a badge ao lado do nome mostra `instance_id.slice(0,4)` (ex: "INST", "F57B"). Trocar para mostrar os ultimos 4 digitos do telefone quando disponivel, e manter o `instance_id` como fallback.

**Arquivo:** `src/pages/Connections.tsx` (linhas 700-704)

Antes:
```typescript
{instance.instance_id && (
  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
    {instance.instance_id.slice(0, 4).toUpperCase()}
  </Badge>
)}
```

Depois:
```typescript
{(instance.phone_number || instance.instance_id) && (
  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
    {instance.phone_number 
      ? `••${instance.phone_number.replace(/\D/g, '').slice(-4)}`
      : instance.instance_id?.slice(0, 4).toUpperCase()}
  </Badge>
)}
```

Na pagina Global Admin (`GlobalAdminConnections.tsx`, linha 745), tambem mostrar os ultimos 4 digitos formatados no campo "Numero".

---

## 2. Puxar numero automaticamente ao conectar

Quando uma instancia conecta com sucesso (status muda para "connected"), o sistema ja faz `refetch()` mas nao puxa o telefone automaticamente. Adicionar chamada de `refreshPhone` apos conexao bem-sucedida.

**Arquivo:** `src/pages/Connections.tsx`

No bloco do Realtime subscription (linha ~182) e no `pollOnce` (linhas ~239, ~275), apos detectar `connected`:
```typescript
// Apos refetch e fechar dialog
refreshPhone.mutate(currentInstanceId);
```

Isso garante que ao escanear o QR Code, o numero sera puxado imediatamente sem precisar clicar no botao manualmente.

---

## 3. Pausar o Evolution API

O sistema nao usa mais o Evolution API, apenas uazapi. Para evitar chamadas desnecessarias:

### 3a. Desabilitar health check automatico

**Arquivo:** `src/hooks/useGlobalAdminInstances.tsx` (linhas 185-206)

Desativar a query de health check do Evolution (que roda a cada 60s):
```typescript
const {
  data: evolutionHealth,
  isLoading: isHealthLoading,
  refetch: refetchHealth,
} = useQuery({
  queryKey: ["evolution-health"],
  queryFn: async (): Promise<EvolutionHealthStatus> => {
    // Evolution API pausada - retornar status offline sem chamar a funcao
    return {
      status: "offline",
      latency_ms: null,
      message: "Evolution API pausada - usando uazapi",
      checked_at: new Date().toISOString(),
    };
  },
  enabled: false, // Desabilitado - nao usar Evolution
  refetchInterval: undefined,
  staleTime: Infinity,
});
```

### 3b. Atualizar texto e referencias na pagina Global Admin

**Arquivo:** `src/pages/global-admin/GlobalAdminConnections.tsx`

- Linha 399: Mudar "Monitore e gerencie todas as instancias do Evolution API" para "Monitore e gerencie todas as instancias WhatsApp"
- Linha 622: Mudar "Empresas por Conexao Evolution" para "Empresas por Conexao"

### 3c. Desabilitar botoes de sync do Evolution

Na pagina Global Admin, os botoes "Reaplicar Webhooks", "Forcar Sync Completo" e "Recriar Perdidas" dependem do Evolution API. Como o provedor ativo e o uazapi, esses botoes devem ser desabilitados ou ocultados para evitar erros.

---

## Resumo de arquivos

| Arquivo | Mudanca |
|---|---|
| `src/pages/Connections.tsx` | Badge com ultimos 4 digitos do telefone; auto-refresh phone apos conexao |
| `src/hooks/useGlobalAdminInstances.tsx` | Desativar health check do Evolution API |
| `src/pages/global-admin/GlobalAdminConnections.tsx` | Atualizar textos; remover referencias ao Evolution |

