

# Corrigir "Iniciar Conversa" -- Selecionar Conexao Correta

## Problema Raiz

Quando voce clica em "Iniciar conversa" na pagina de Contatos, a URL recebe corretamente o parametro `connectionId`. Porem, na pagina de Conversas (linha 739), a busca por conversa existente encontra a **primeira** conversa com aquele telefone, ignorando a conexao solicitada.

Como o contato "Vicente" existe nas duas conexoes (9089 e 6064), o sistema sempre abre a da 9089 (que aparece primeiro na lista).

## Solucao

Alterar a logica de busca na pagina de Conversas para priorizar a conexao correta:

1. Se `connectionIdParam` esta presente, buscar primeiro uma conversa que combine telefone **E** conexao
2. Se nao encontrar com a conexao especifica, usar o fallback atual (qualquer conversa com aquele telefone)

### Arquivo: `src/pages/Conversations.tsx` (linhas 738-752)

```text
ANTES:
// Busca qualquer conversa com o telefone (ignora conexao)
const existingConv = conversations.find(c => matchPhone(c))

DEPOIS:
// Se connectionId informado, buscar conversa com telefone + conexao especifica
let existingConv = null;
if (connectionIdParam) {
  existingConv = conversations.find(c => 
    c.whatsapp_instance_id === connectionIdParam && matchPhone(c)
  );
}
// Fallback: qualquer conversa com o telefone
if (!existingConv) {
  existingConv = conversations.find(c => matchPhone(c));
}
```

Isso garante que ao clicar "Iniciar conversa" no contato da conexao 6064, o sistema abre a conversa correta da 6064, nao a da 9089.

## Detalhes Tecnicos

- 1 arquivo alterado: `src/pages/Conversations.tsx`
- Alteracao apenas na logica de busca local (linhas 738-752)
- Nao afeta criacao de novas conversas (linha 756 ja usa `connectionIdParam` corretamente)
- Sem alteracoes no backend

