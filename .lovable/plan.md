

## Melhorar Botao "Reconectar" na Tela de Conversas

### Problema Atual

Quando uma instancia WhatsApp cai, o banner vermelho na area de chat mostra o botao "Reconectar" que apenas abre `/connections` em uma **nova aba** (`window.open("/connections", "_blank")`). Isso:

1. Nao atualiza o status da instancia (nao chama `refreshStatus`)
2. Abre em nova aba, tirando o usuario do contexto
3. Na pagina de conexoes, o usuario precisa manualmente clicar em "Atualizar status" - e geralmente isso ja resolve

### Solucao

Alterar o botao "Reconectar" para:

1. **Chamar `refreshStatus`** na instancia desconectada (forcar verificacao no Evolution API)
2. **Aguardar o resultado** - se reconectou, mostrar feedback positivo e fechar o banner
3. **Se nao reconectou**, navegar para `/connections` na mesma aba para o usuario resolver manualmente

### Detalhes Tecnicos

**Arquivo: `src/pages/Conversations.tsx`**

- O `instanceDisconnectedInfo` ja contem o `instanceId` da instancia desconectada (linha 504)
- Importar `useWhatsAppInstances` (ja disponivel no contexto do componente, verificar se ja esta importado)
- Verificar se o hook `useWhatsAppInstances` ja esta sendo usado - caso contrario, usar `supabase.functions.invoke` diretamente para chamar o `refreshStatus` sem importar o hook completo (evitar carregar toda a logica de instancias)

**Abordagem escolhida**: Chamar a edge function `evolution-api` diretamente com action `refresh_status`, pois o componente de Conversations ja e muito grande e importar o hook inteiro adicionaria peso desnecessario.

**Fluxo do botao:**

```text
[Clique em "Reconectar"]
    |
    v
[Mostrar loading "Reconectando..."]
    |
    v
[Chamar evolution-api { action: "refresh_status", instanceId }]
    |
    +---> Status = connected --> Toast "Reconectado!" + invalidar queries
    |
    +---> Status != connected --> navigate("/connections") na mesma aba
```

**Mudancas no codigo (linha ~4394-4413):**

1. Adicionar estado `isReconnecting` local (useState)
2. Criar funcao `handleReconnect` que:
   - Seta `isReconnecting = true`
   - Chama `supabase.functions.invoke("evolution-api", { body: { action: "refresh_status", instanceId } })`
   - Se sucesso e status voltou para connected: invalidar query `whatsapp-instances`, mostrar toast de sucesso
   - Se falhou ou nao conectou: navegar para `/connections` com `navigate("/connections")`
3. Alterar o botao para chamar `handleReconnect` em vez de `window.open`
4. Mostrar spinner no botao durante o processo

**Icone do botao**: Trocar `ExternalLink` por `RefreshCw` (ja importado) para indicar que e uma acao de reconexao, nao um link externo.

### Risco

| Alteracao | Risco | Justificativa |
|-----------|-------|---------------|
| Chamar refresh_status | **Baixo** | Ja e uma operacao existente, apenas chamada de outro ponto |
| Navegar na mesma aba | **Muito Baixo** | Usa react-router navigate, padrao do projeto |
| Estado local isReconnecting | **Muito Baixo** | Estado isolado, nao afeta outros componentes |

Nenhuma alteracao em banco de dados, edge functions ou RLS. Apenas logica frontend no componente de Conversas.
