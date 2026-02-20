

## Corrigir erro "Maximum update depth exceeded" (React 19 + Radix UI)

### O que e esse erro

E um bug **conhecido** entre o React 19 e a biblioteca `@radix-ui/react-compose-refs` (versao 1.1.2). Quando o React 19 chama callbacks de ref, a funcao `setRef` dentro do compose-refs entra em loop infinito, causando tela branca.

Esse erro pode acontecer em **qualquer pagina** que use componentes Radix (Button, Dialog, DropdownMenu, Select, etc.) - nao so no Global Admin. A correcao anterior no TenantMismatch foi um paliativo local; precisamos de uma correcao global.

### Causa raiz

O React 19 mudou o comportamento de ref callbacks (agora podem retornar funcoes de cleanup). O `compose-refs@1.1.2` usa `setState` dentro de refs, o que no React 19 causa re-renders infinitos.

### Solucao

Adicionar um **override** no `package.json` para forcar a resolucao do `@radix-ui/react-compose-refs` para a versao `1.1.1`, que nao tem esse bug com React 19. Isso corrige o problema em **todas as paginas** de uma vez, sem precisar trocar componentes Radix por HTML puro.

### Detalhes Tecnicos

**Arquivo: `package.json`**

Adicionar a secao `overrides` para fixar a versao do compose-refs:

```json
{
  "overrides": {
    "@radix-ui/react-compose-refs": "1.1.1"
  }
}
```

Isso forca **todos** os pacotes Radix que dependem de `compose-refs` a usar a versao 1.1.1, que e compativel com React 19.

**Arquivo: `src/pages/TenantMismatch.tsx`** (opcional)

Reverter a pagina TenantMismatch para usar os componentes Radix normais (Button, Card) novamente, ja que o override global resolve o problema. Isso mantem consistencia no projeto.

### Risco

| Alteracao | Risco | Justificativa |
|-----------|-------|---------------|
| Override do compose-refs para 1.1.1 | **Baixo** | Versao 1.1.1 e estavel e usada amplamente. A unica diferenca e que nao tem o bug de React 19 |
| Reverter TenantMismatch (opcional) | **Muito Baixo** | Volta a usar os mesmos componentes do resto do app |

Nenhuma alteracao em banco de dados, edge functions ou logica de negocio.

