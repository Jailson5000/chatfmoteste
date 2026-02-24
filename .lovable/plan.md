

# Corrigir botoes da pagina de Conexoes

## Problema

A pagina de Conexoes tem dois problemas com os botoes de acao:

1. **"Atualizar status" desconecta**: A instancia "MIAUHOJE" e do provedor **Evolution** (desativado). Quando voce clica em "Atualizar status", o backend tenta chamar a API do Evolution que esta fora do ar, falha/timeout, e retorna `status = "disconnected"` -- mesmo que a instancia ja estivesse assim. Pior: para instancias uazapi **conectadas**, esse endpoint chama `/instance/status` que pode retornar estado transitorio e sobrescrever o status no banco, gerando a sensacao de "desconectou".

2. **Botoes descontextualizados**: O dropdown mostra as mesmas opcoes para todas as instancias, sem considerar o provedor (uazapi vs evolution) ou o status atual. Por exemplo:
   - "Atualizar status" aparece para instancias Evolution desativadas (inutil e perigoso)
   - "Conectar" aparece mesmo para instancias Evolution antigas que nao devem ser reconectadas
   - Nao tem opcao "Atualizar numero" no dropdown

## Solucao

### 1. Dropdown contextual por provedor e status

**Arquivo:** `src/pages/Connections.tsx` (linhas 774-805)

Reescrever o `DropdownMenuContent` para mostrar opcoes relevantes:

- **Instancia uazapi conectada**: "Ver detalhes", "Atualizar número", "Excluir"
- **Instancia uazapi desconectada**: "Ver detalhes", "Conectar", "Excluir"  
- **Instancia Evolution (desativada)**: "Ver detalhes", "Excluir" (sem "Atualizar status" nem "Conectar")

Remover o botao "Atualizar status" do dropdown -- ele e redundante pois o status ja e atualizado automaticamente via webhook e o botao causa problemas. Em vez dele, manter apenas "Atualizar número" para instancias conectadas (que chama `refreshPhone`).

### 2. Protecao no backend (opcional, seguranca extra)

**Arquivo:** `supabase/functions/evolution-api/index.ts` (case `refresh_status`, linha 2187)

Adicionar validacao: se a instancia for Evolution e o Evolution estiver desativado, retornar o status atual do banco sem chamar a API externa:

```typescript
if (!isUazapi(instance)) {
  // Evolution desativada -- retorna status atual sem chamar API
  return new Response(
    JSON.stringify({ success: true, status: instance.status, instance }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Resumo de mudancas

| Arquivo | Mudanca |
|---|---|
| `src/pages/Connections.tsx` | Dropdown contextual: botoes diferentes por provedor/status |
| `supabase/functions/evolution-api/index.ts` | (Opcional) Protecao para nao chamar Evolution API desativada |

## Resultado esperado

- "Atualizar status" nao aparece mais (substituido por "Atualizar número" quando conectado)
- Instancias Evolution antigas so mostram "Ver detalhes" e "Excluir"
- Nenhum botao causa desconexao acidental
- Opcoes claras e contextuais para cada situacao

