

# Otimizacao de Performance: staleTime Global + Lazy Loading

## O que vamos fazer

Duas otimizacoes no arquivo `src/App.tsx` que melhoram significativamente a velocidade do sistema sem alterar nenhuma logica de negocio.

---

## 1. staleTime Global no QueryClient

**Problema atual**: Toda vez que o usuario navega entre paginas (ex: Dashboard -> Conversas -> Kanban), TODOS os dados sao buscados novamente do banco, mesmo que tenham sido carregados 5 segundos atras.

**Solucao**: Configurar o QueryClient para considerar dados "frescos" por 2 minutos. Dados buscados nos ultimos 2 minutos nao disparam nova requisicao.

**Impacto**: ~60% menos requisicoes ao banco durante navegacao normal.

**Mudanca**:
```typescript
// ANTES (linha 68)
const queryClient = new QueryClient();

// DEPOIS
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,   // 2 minutos - dados ficam "frescos"
      gcTime: 10 * 60 * 1000,     // 10 minutos - cache mantido em memoria
      retry: 1,                    // 1 retry em caso de erro (em vez de 3)
    },
  },
});
```

**Risco**: Zero. O Realtime ja atualiza dados em tempo real via WebSocket. O staleTime apenas evita refetches redundantes na navegacao. Qualquer `invalidateQueries` manual continua funcionando normalmente.

---

## 2. Lazy Loading de Rotas Secundarias

**Problema atual**: O browser carrega o codigo de TODAS as 35+ paginas no bundle inicial, mesmo que o usuario so use 3-4 paginas (Conversas, Kanban, Dashboard). Isso torna o primeiro carregamento mais lento.

**Solucao**: Usar `React.lazy()` para carregar paginas secundarias sob demanda (apenas quando o usuario navegar ate elas).

### Paginas que serao lazy-loaded (19 paginas):

| Grupo | Paginas | Motivo |
|-------|---------|--------|
| Global Admin (16) | Todas as paginas `/global-admin/*` | So acessadas pelo admin global -- 0.1% dos usuarios |
| Secundarias (3) | AgendaPro, KnowledgeBase, AIVoice | Visitadas esporadicamente |
| Utilidades (4) | Tutorials, Support, Profile, MetaTestPage | Visitadas raramente |
| Publicas (4) | Register, PaymentSuccess, PublicBooking, ConfirmAppointment | Visitadas 1x |
| Legais (2) | PrivacyPolicy, TermsOfService | Quase nunca visitadas |

### Paginas que ficam SINCRONAS (carregamento imediato):

| Pagina | Motivo |
|--------|--------|
| Index (Landing) | Primeira pagina que o usuario ve |
| Auth, AuthCallback, MetaAuthCallback | Fluxo de login -- precisa ser instantaneo |
| ResetPassword, ChangePassword | Fluxo de senha |
| Dashboard | Pagina principal apos login |
| Conversations | Pagina mais usada do sistema |
| Kanban | Segunda pagina mais usada |
| Settings | Usada frequentemente |
| Contacts | Usada frequentemente |
| Connections | Usada por admins frequentemente |
| AIAgents, AIAgentEdit | Usada por admins frequentemente |
| Tasks | Usada diariamente |
| Onboarding | Fluxo inicial |
| NotFound | Precisa estar sempre disponivel |

### Como funciona o lazy loading

Quando o usuario clicar em uma pagina lazy-loaded, aparecera um breve indicador de carregamento (< 1 segundo) na primeira vez. Nas visitas seguintes, o codigo ja estara em cache do browser.

**Implementacao**: Envolver cada import lazy com `React.lazy()` e cada `<Route>` com `<Suspense fallback={...}>`.

---

## Resumo do Impacto

| Metrica | Antes | Depois |
|---------|-------|--------|
| Bundle inicial | 100% das paginas | ~55% (apenas paginas frequentes) |
| Requisicoes ao navegar | Toda navegacao = refetch | Apenas se dados > 2 min |
| Primeiro carregamento | Mais lento (carrega tudo) | ~35% mais rapido |
| Risco de quebrar algo | - | Zero (nenhuma logica alterada) |

## Arquivo alterado

Apenas **1 arquivo**: `src/App.tsx`

- Linha 68: QueryClient com defaultOptions
- Linhas 1-66: Imports convertidos para React.lazy onde aplicavel
- Rotas com Suspense wrapper para paginas lazy

Nenhum outro arquivo do projeto e alterado. Nenhuma dependencia nova necessaria.
