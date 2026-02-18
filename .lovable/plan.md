
# Remover Página /meta-test

## Analise de Impacto

A pagina `/meta-test` e referenciada em apenas 2 locais:
- **`src/App.tsx`** -- a definicao da rota (linhas 302-312)
- **`src/pages/admin/MetaTestPage.tsx`** -- o componente em si

Nenhum outro componente, hook ou funcao importa ou depende dessa pagina. A remocao e segura.

## Mudancas

### 1. `src/App.tsx`
- Remover o import lazy do `MetaTestPage` (linha 48)
- Remover o bloco da rota `/meta-test` (linhas 302-312)

### 2. `src/pages/admin/MetaTestPage.tsx`
- Deletar o arquivo

## Risco

**Zero.** Nenhum componente depende dessa pagina. As conexoes de teste manuais salvas no banco com `source: manual_test` continuarao existindo mas nao afetam nada -- elas ja sao filtradas pela interface de producao que busca apenas `source: oauth`.
