

# Corrigir detecao de subdominio no ambiente de preview

## Contexto

O erro "Acesso nao permitido" acontece APENAS no ambiente de preview/desenvolvimento (lovable.app). Em producao (miauchat.com.br), tudo funciona normalmente. Clientes finais nunca veem dominio lovable.app.

## Problema

A funcao `extractSubdomain()` em `src/hooks/useTenant.tsx` nao reconhece URLs do tipo `*.lovable.app` como ambiente de desenvolvimento. Ela interpreta parte da URL como subdominio de tenant, o que causa o bloqueio no `ProtectedRoute`.

## Solucao

Adicionar uma unica verificacao no inicio da funcao `extractSubdomain()` para ignorar dominios lovable.app.

### Arquivo: `src/hooks/useTenant.tsx`

Na funcao `extractSubdomain`, logo apos a verificacao de localhost (linha ~98), adicionar:

```text
// Ambiente de desenvolvimento/preview Lovable - ignorar
if (host.endsWith('.lovable.app') || host.endsWith('.lovableproject.com')) {
  return null;
}
```

### Impacto

- 1 arquivo alterado, 4 linhas adicionadas
- Zero impacto em producao (miauchat.com.br)
- Corrige apenas o ambiente de preview para permitir testes normais
- Nenhum cliente final e afetado por esta mudanca

