
# Otimizar Velocidade das Paginas

## Diagnostico

A analise de performance revelou problemas criticos:

| Metrica | Valor Atual | Ideal |
|---------|------------|-------|
| First Contentful Paint (FCP) | 3896ms | < 1800ms |
| DOM Content Loaded | 3775ms | < 2000ms |
| Scripts carregados | 250 arquivos / 3013KB | Reduzir ~60% |

### Causas Raiz

1. **Imports sincronos de paginas pesadas** -- 8 paginas sao importadas sincronamente mesmo que o usuario so visite 1 por vez:
   - `Conversations.tsx` (172KB) -- a mais pesada
   - `Dashboard.tsx`, `Kanban.tsx`, `Settings.tsx`, `Contacts.tsx`, `Connections.tsx`, `AIAgents.tsx`, `Tasks.tsx`
   
2. **Providers globais desnecessarios** -- `RealtimeSyncProvider` e `TenantProvider` envolvem TODA a aplicacao, incluindo Global Admin que nao precisa deles. Isso forca conexoes WebSocket e queries ao banco mesmo quando o admin esta so gerenciando empresas.

3. **Bibliotecas pesadas carregadas no inicio** -- `recharts` (219KB) e `lucide-react` (156KB) sao carregadas na inicializacao independente da pagina.

## Solucao

### 1. Lazy-load de TODAS as paginas do cliente

Converter os 8 imports sincronos para `React.lazy()`. O usuario so carrega o codigo da pagina que esta acessando.

**Economia estimada**: ~500KB removidos do bundle inicial.

Paginas afetadas:
- `Dashboard` 
- `Conversations` (172KB -- maior ganho)
- `Kanban`
- `Settings`
- `Contacts`
- `Connections`
- `AIAgents` + `AIAgentEdit`
- `Tasks`
- `Onboarding`

### 2. Mover RealtimeSyncProvider para dentro do AppLayout

O Global Admin nao precisa de canais Realtime (WebSocket). Mover o provider de fora do `App.tsx` para dentro do `AppLayout`, eliminando 3 canais WebSocket desnecessarios quando o admin esta logado.

### 3. Separar TenantProvider do Global Admin

Criar um wrapper `TenantRealtimeWrapper` que so e usado nas rotas protegidas do cliente. As rotas do Global Admin ficam sem esses providers.

## Detalhes Tecnicos

### Arquivo: `src/App.tsx`

- Converter imports sincronos (linhas 25-35) para `React.lazy()`
- Remover `RealtimeSyncProvider` do wrapper global
- Manter `AuthProvider` e `TabSessionProvider` globais (necessarios para ambos os fluxos)
- Envolver rotas protegidas com `TenantProvider` + `RealtimeSyncProvider` via um componente wrapper

### Arquivo: `src/components/layout/AppLayout.tsx`

- Adicionar `RealtimeSyncProvider` envolvendo o layout do cliente
- Alternativa: criar componente `ClientProviders` que encapsula `TenantProvider` + `RealtimeSyncProvider`

### Resultado Esperado

- FCP: de ~3900ms para ~1500ms (reducao de ~60%)
- Bundle inicial: de ~3013KB para ~1200KB
- Global Admin: carrega sem WebSocket e sem queries de tenant
- Paginas do cliente: carregam sob demanda com spinner de loading
