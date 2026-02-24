

# Correcoes: Envio de Imagens por Template + Visual Global Admin Conexoes

## Problema 1: IA nao envia imagens como template para o WhatsApp

### Diagnostico confirmado pelos logs

```
ERROR [AI Chat] Failed to send template media to WhatsApp: {"error":"missing text for text message"}
```

O endpoint `/send/media` do uazapi requer o campo `type` para identificar o tipo de midia. O payload atual envia apenas `{ number, file }` mas falta `type: "image"`. Comparando com o `whatsapp-provider.ts` (que funciona corretamente), o payload correto e:

```
{ number, type: "image", file: mediaUrl }
```

O `whatsapp-provider.ts` na linha 567 mostra: `type: opts.mediaType` — o campo `type` e obrigatorio no uazapi.

### Correcao

**Arquivo: `supabase/functions/ai-chat/index.ts`** (linhas 2336-2340)

Adicionar o campo `type` ao payload de midia uazapi, mapeando `finalMediaType` para o tipo correto:

```typescript
// ANTES:
mediaPayload = { number: targetNumber, file: finalMediaUrl };

// DEPOIS:
mediaPayload = { 
  number: targetNumber, 
  file: finalMediaUrl, 
  type: finalMediaType || 'image'  // 'image', 'video', 'document'
};
```

---

## Problema 2: Global Admin Conexoes — Visual desatualizado

### Diagnostico

A pagina `GlobalAdminConnections.tsx` tem varios problemas:

1. **Header diz "Evolution API"** — mas o provedor principal e uazapi
2. **Card de status global** mostra "Evolution API" com status hardcoded "offline/pausada"
3. **Metricas (cards)** referenciam `evolutionHealth?.instances_summary` que esta sempre null (query desabilitada)
4. **"Empresas por Conexao"** agrupa por `evolution_api_connections` — instancias uazapi nao tem match e caem em "unknown"
5. **Titulo da tabela** diz "Instancias do Evolution"
6. **EvolutionApiConnectionsCard** mostra "Provedores Evolution API" — irrelevante para uazapi
7. **Nao mostra o provedor** de cada instancia (evolution vs uazapi)
8. **InstanceHealthSummary** busca direto de `whatsapp_instances` (funciona, mas nao filtra por provedor)

### Correcao

**Arquivo: `src/pages/global-admin/GlobalAdminConnections.tsx`**

Mudancas visuais e funcionais:

1. **Header**: Mudar "Conexoes WhatsApp" (ja esta) — OK, manter
2. **Remover card "Evolution API"** (status global hardcoded offline) — substituir por card resumo que mostra contagem por provedor (uazapi vs evolution)
3. **Cards de metricas**: Usar dados locais (`instances.filter(...)`) em vez de `evolutionHealth?.instances_summary` — ja faz fallback, mas remover referencia ao evolution
4. **Adicionar coluna "Provedor"** na tabela — mostrar badge "uazapi" ou "evolution" por instancia (requer buscar `api_provider` do `whatsapp_instances_safe`)
5. **Titulo da tabela**: Mudar "Instancias do Evolution" para "Todas as Instancias"
6. **Agrupamento**: Em vez de agrupar por `evolution_api_connections`, agrupar por provedor (`api_provider`) — instancias uazapi num grupo, evolution noutro
7. **Remover EvolutionApiConnectionsCard** da exibicao principal (mover para aba secundaria ou esconder) — esta irrelevante para uazapi

**Arquivo: `src/hooks/useGlobalAdminInstances.tsx`**

- Incluir `api_provider` no tipo `InstanceWithCompany`
- O campo `api_provider` ja esta na view `whatsapp_instances_safe` (confirmado na migracao)

### Resumo visual esperado

```text
+------------------------------------------+
| Conexoes WhatsApp                        |
| Monitore todas as instancias             |
+------------------------------------------+

+--------+  +-----------+  +----------+  +----------+  +------+
| Total  |  | Conectadas|  | Conectando|  |Desconect.|  | Erro |
|   4    |  |    3      |  |    0      |  |    1     |  |  0   |
+--------+  +-----------+  +----------+  +----------+  +------+

+------------------------------------------+
| Todas as Instancias (4)                  |
+------------------------------------------+
| Empresa  | Instancia | Provedor | Num... |
|----------|-----------|----------|--------|
| FMO      | FMOANT..  | uazapi   | +55... |
| Teste    | Teste1    | uazapi   | +55... |
+------------------------------------------+
```

## Resumo de mudancas

| Arquivo | Mudanca | Prioridade |
|---|---|---|
| `ai-chat/index.ts` | Adicionar campo `type` ao payload de midia uazapi | CRITICO |
| `useGlobalAdminInstances.tsx` | Adicionar `api_provider` ao tipo e ao mapeamento | MEDIO |
| `GlobalAdminConnections.tsx` | Remover card Evolution, renomear titulos, adicionar coluna provedor, agrupar por provedor | MEDIO |

