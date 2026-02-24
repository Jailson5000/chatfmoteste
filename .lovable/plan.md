
# Corrigir Tela Travada em "Verificando acesso..."

## Problema Raiz

O `ProtectedRoute` usa o hook `useTenant()` para verificar o subdominio do usuario. Porem, o `TenantProvider` (que fornece os dados para esse hook) esta dentro do `AppLayout`, que e um **filho** do `ProtectedRoute`.

Isso significa que quando o `ProtectedRoute` chama `useTenant()`, ele recebe o valor padrao do contexto, que tem `isLoading: true` **para sempre**. A tela nunca sai do estado "Verificando acesso..." porque `tenantLoading` nunca se torna `false`.

```text
Hierarquia ATUAL (com bug):

  App
    AuthProvider
      ProtectedRoute  <-- usa useTenant() aqui (sem TenantProvider acima!)
        AppLayout
          TenantProvider  <-- provider esta aqui, muito abaixo
            Outlet
```

## Solucao

Mover o `TenantProvider` para o `App.tsx`, envolvendo todas as rotas. Isso garante que tanto o `ProtectedRoute` quanto o `AppLayout` tenham acesso ao contexto do tenant.

```text
Hierarquia CORRIGIDA:

  App
    AuthProvider
      TenantProvider  <-- movido para ca
        ProtectedRoute  <-- agora useTenant() funciona!
          AppLayout
            Outlet
```

## Alteracoes

### Arquivo: `src/App.tsx`
- Importar `TenantProvider` de `@/hooks/useTenant`
- Envolver o `BrowserRouter` com `TenantProvider`

### Arquivo: `src/components/layout/AppLayout.tsx`
- Remover o `TenantProvider` de dentro do AppLayout (para evitar provider duplicado)
- Manter o `RealtimeSyncProvider`

Estas sao alteracoes minimas e de baixo risco que corrigem o problema sem mudar nenhuma logica de negocio.
