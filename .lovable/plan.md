
# Corrigir Fallback de Conexao no "Iniciar Conversa"

## Problema

Na linha 756 de `Conversations.tsx`, quando o `connectionIdParam` esta definido (ex: instancia 6064) mas nao existe conversa naquela conexao especifica, o sistema faz fallback para qualquer conversa com o mesmo telefone. Isso encontra a conversa da instancia 9089 e abre ela em vez de criar uma nova conversa na 6064.

## Solucao

Remover o fallback quando `connectionIdParam` esta presente. Se o usuario pediu uma conexao especifica e nao ha conversa nela, o sistema deve ir direto para a logica de criar/buscar conversa naquela conexao (que ja funciona corretamente nas linhas 765+).

### Arquivo: `src/pages/Conversations.tsx` (linhas 755-758)

```text
ANTES:
// Fallback: any conversation with this phone
if (!existingConv) {
  existingConv = conversations.find(c => matchPhone(c));
}

DEPOIS:
// Fallback: only if no specific connection was requested
if (!existingConv && !connectionIdParam) {
  existingConv = conversations.find(c => matchPhone(c));
}
```

Uma unica linha alterada. A logica abaixo (linha 765+) ja trata corretamente a criacao/busca de conversa na conexao especifica via `connectionIdParam`.
