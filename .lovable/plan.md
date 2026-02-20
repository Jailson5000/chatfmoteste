

## Corrigir definitivamente o erro de tela branca (React 19 + Radix UI)

### Problema

As correcoes anteriores adicionaram `@radix-ui/react-compose-refs: "^1.1.1"` como dependencia direta, porem:

1. O caret (`^`) permite resolucao para 1.1.2
2. O bloco `overrides` **nunca foi efetivamente adicionado** ao package.json — ele nao existe no arquivo atual
3. Sem o `overrides`, cada pacote Radix (Dialog, Select, Tooltip, Progress, Avatar, etc.) traz sua propria copia do compose-refs 1.1.2 como dependencia transitiva
4. Resultado: tela branca em qualquer pagina que renderize componentes Radix (Dashboard, Global Admin, etc.)

### Solucao

Duas alteracoes no `package.json`:

1. **Fixar a versao direta sem caret** — trocar `"^1.1.1"` por `"1.1.1"` na linha 24
2. **Adicionar bloco `overrides`** ao final do package.json — isso forca TODAS as dependencias transitivas dos ~25 pacotes Radix a usar compose-refs 1.1.1

### Detalhes Tecnicos

**Arquivo: `package.json`**

Linha 24 — trocar:
```json
"@radix-ui/react-compose-refs": "^1.1.1",
```
por:
```json
"@radix-ui/react-compose-refs": "1.1.1",
```

Adicionar antes do ultimo `}` do arquivo:
```json
"overrides": {
  "@radix-ui/react-compose-refs": "1.1.1"
}
```

O bloco `overrides` e um recurso nativo do npm que forca a resolucao de dependencias transitivas. Quando o pacote `@radix-ui/react-dialog` pede `compose-refs@^1.1.0`, o npm normalmente resolve para 1.1.2 (a mais recente). Com o override, ele e forcado a usar 1.1.1 em **todos** os casos.

### Por que as correcoes anteriores nao funcionaram

| Tentativa | O que foi feito | Por que nao resolveu |
|-----------|----------------|---------------------|
| 1a - TenantMismatch | Trocou componentes Radix por HTML puro | Corrigiu so 1 pagina, nao o problema raiz |
| 2a - compose-refs ^1.1.1 | Adicionou dependencia direta com caret | O caret permite 1.1.2; e o bloco overrides nao foi adicionado ao arquivo |

### Impacto

- Corrige tela branca em **todas** as paginas (Dashboard, Global Admin, Conversations, etc.)
- Nao altera nenhum componente, hook, edge function ou logica de negocio
- Correcao imediata para os clientes afetados
- Nenhuma alteracao em banco de dados ou RLS

### Risco

| Alteracao | Risco |
|-----------|-------|
| Pin compose-refs 1.1.1 sem caret | **Muito Baixo** — versao estavel e amplamente usada |
| Bloco overrides | **Muito Baixo** — mecanismo padrao do npm |

