

# Corrigir Carregamento Automatico Apos Login

## Problema

Quando o usuario faz login, os dados nao carregam automaticamente. Ele precisa dar F5 para que o Dashboard, Conversas e outras paginas funcionem.

## Causa Raiz

O hook `useLawFirm` usa a queryKey `["law_firm"]` sem incluir o ID do usuario. Quando o app carrega antes do login, o React Query armazena o resultado `null` no cache. Apos o login:

1. A queryKey nao muda (nao depende do usuario)
2. O cache de 2 minutos (staleTime) impede uma nova busca
3. Nao existe invalidacao de cache quando o estado de autenticacao muda

Como `lawFirm` continua `null`, todas as queries dependentes (conversas, metricas, contatos, etc.) ficam desabilitadas (`enabled: !!lawFirm?.id`), resultando em telas vazias.

## Solucao

### 1. Adicionar `user?.id` na queryKey do `useLawFirm`

Arquivo: `src/hooks/useLawFirm.tsx`

- Importar `useAuth` para acessar o usuario atual
- Alterar a queryKey de `["law_firm"]` para `["law_firm", user?.id]`
- Adicionar `enabled: !!user` para nao executar a query sem usuario logado

Isso faz com que, ao mudar o estado de autenticacao (login/logout), o React Query trate como uma query nova e execute automaticamente.

### 2. Invalidar todo o cache apos login bem-sucedido

Arquivo: `src/pages/Auth.tsx`

- Apos o `signInWithPassword` com sucesso, chamar `queryClient.clear()` para limpar todo o cache antigo
- Isso garante que nenhum dado stale de uma sessao anterior interfira

### 3. Invalidar cache no listener de auth do App

Arquivo: `src/App.tsx`

- Adicionar um `useEffect` com `onAuthStateChange` no nivel do `QueryClientProvider` que, ao receber evento `SIGNED_IN`, faca `queryClient.invalidateQueries()` para forcar refetch de todas as queries ativas

## Impacto

- Dashboard: carrega metricas imediatamente apos login
- Conversas: lista de conversas aparece sem F5
- Kanban: cards carregam automaticamente
- Todas as outras paginas: dados disponiveis ao navegar

## Arquivos Alterados

1. `src/hooks/useLawFirm.tsx` -- queryKey com user?.id + enabled flag
2. `src/pages/Auth.tsx` -- limpar cache apos login
3. `src/App.tsx` -- listener global de invalidacao no auth state change

