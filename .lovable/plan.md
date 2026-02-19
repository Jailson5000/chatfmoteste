
# Corrigir "Iniciar Conversa" para Abrir na Conexao Correta

## Problema

Na pagina de Contatos, o botao "Iniciar conversa" navega para a pagina de Conversas passando apenas `phone` e `name` na URL. Como nao envia o `connectionId`, a pagina de Conversas abre na conexao padrao (primeira disponivel) em vez da conexao vinculada ao contato.

Exemplo: O contato "Contato 2752" esta na conexao 6064, mas ao clicar "Iniciar conversa", abre na conexao 9089.

## Solucao

Alterar a navegacao do botao "Iniciar conversa" para incluir o `connectionId` baseado na instancia vinculada ao contato.

### Arquivo: `src/pages/Contacts.tsx`

Na linha 522, onde o navigate e chamado:

```text
ANTES:
navigate(`/conversations?phone=${...}&name=${...}`)

DEPOIS:
navigate(`/conversations?phone=${...}&name=${...}&connectionId=${client.whatsapp_instance_id || client.conversations?.[0]?.whatsapp_instance_id || ''}`)
```

A logica de fallback segue a mesma prioridade ja usada no sistema:
1. `client.whatsapp_instance_id` (conexao direta do contato)
2. `client.conversations[0].whatsapp_instance_id` (conexao da ultima conversa)
3. Sem connectionId (fallback para comportamento padrao)

## Status dos Webhooks

Os webhooks estao funcionando corretamente apos a configuracao manual. Nenhum evento desnecessario (presence.update, chats.update, etc.) esta aparecendo nos logs recentes, confirmando que a Evolution API parou de enviar esses eventos.

## Detalhes Tecnicos

- Alteracao em 1 arquivo: `src/pages/Contacts.tsx` (linha 522)
- A pagina de Conversas ja possui logica para ler o parametro `connectionId` da URL e selecionar a conexao correta
- Nenhuma alteracao necessaria no backend ou nos webhooks
