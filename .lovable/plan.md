

# Correção: WhatsApp Cloud travado + Instagram/Facebook sem receber mensagens

## Problema 1: Instagram/Facebook - Erro de timestamp

**Causa raiz**: O webhook da Meta envia o `timestamp` do Instagram em **milissegundos**, mas o codigo trata como se fosse em **segundos** (faz `timestamp * 1000`). Isso gera datas absurdas como o ano 58088, causando o erro do PostgreSQL:

```
time zone displacement out of range: "+058088-12-27T23:58:22.000Z"
```

Isso impede a criacao de novas conversas e a atualizacao de conversas existentes.

**Solucao**: Criar uma funcao auxiliar `normalizeTimestamp` que detecta automaticamente se o timestamp esta em milissegundos ou segundos e normaliza para milissegundos:

```text
normalizeTimestamp(ts):
  se ts > 10000000000 -> ja esta em milissegundos
  senao -> multiplicar por 1000
```

**Arquivos afetados**: `supabase/functions/meta-webhook/index.ts`

**Linhas a alterar** (3 ocorrencias na funcao `processMessagingEntry`):
- Linha 344: `new Date(timestamp * 1000)` -> `new Date(normalizeTimestamp(timestamp))`
- Linha 374: `new Date(timestamp * 1000)` -> `new Date(normalizeTimestamp(timestamp))`
- Apos a correcao, mensagens do Instagram e Facebook voltarao a ser processadas normalmente.

---

## Problema 2: WhatsApp Cloud - "Conectando..." infinito

**Causa raiz**: A funcao `FB.login` abre o popup do Facebook, mas o callback so e chamado quando o usuario **fecha o popup ou completa o fluxo**. Se o popup nao abre (bloqueado pelo navegador) ou se a configuracao do Embedded Signup (config_id) esta incorreta, o callback nunca e chamado, e o botao fica preso em "Conectando..." para sempre.

**Problemas identificados**:
1. **Sem timeout**: Nao ha mecanismo de timeout para detectar quando o popup falhou
2. **Sem deteccao de popup bloqueado**: Se o navegador bloqueia o popup, o usuario nao recebe feedback
3. **Sem log de debug**: Nenhum console.log antes/depois do FB.login para ajudar na depuracao

**Solucao**:
1. Adicionar um **timeout de 3 minutos** que reseta o estado `isConnecting` caso o callback nunca seja chamado
2. Adicionar **logs de debug** no `FB.login` para diagnosticar o problema
3. Adicionar **deteccao de popup bloqueado** verificando se o popup foi aberto com sucesso
4. Mostrar um **toast informativo** se o timeout for atingido

**Arquivo afetado**: `src/components/connections/NewWhatsAppCloudDialog.tsx`

**Mudancas especificas**:
- Envolver o `FB.login` em um try/catch
- Adicionar `console.log` antes e depois do `FB.login` para rastreamento
- Adicionar `setTimeout` de 180 segundos que reseta `isConnecting` e mostra toast de aviso
- Limpar o timeout quando o callback e chamado com sucesso

---

## Resumo das alteracoes

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/meta-webhook/index.ts` | Adicionar funcao `normalizeTimestamp()` e usar nas 3 ocorrencias de `new Date(timestamp * 1000)` na funcao `processMessagingEntry` |
| `src/components/connections/NewWhatsAppCloudDialog.tsx` | Adicionar timeout de 3 min, logs de debug, e deteccao de falha no popup do FB.login |

## Ordem de implementacao

1. Corrigir o timestamp no `meta-webhook` (resolve Instagram/Facebook imediatamente)
2. Adicionar timeout e logs no `NewWhatsAppCloudDialog` (resolve UX do WhatsApp Cloud)
3. Redeployar o `meta-webhook`

