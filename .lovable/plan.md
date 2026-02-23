
# Recriar instancias na Evolution API apos reset de volumes

## Problema

Apos o `docker compose down -v`, o banco de dados interno da Evolution API foi apagado. Todas as 8 instancias que existiam la dentro foram perdidas. No banco de dados da plataforma, elas continuam registradas mas com status `not_found_in_evolution`.

Os botoes "Reaplicar Webhooks" e "Sincronizacao Completa" **ignoram** instancias com status `not_found_in_evolution` (filtro explicito no codigo), por isso 0 de 8 sao processadas.

O QR code ja funciona no Manager da Evolution (v2.3.3 esta OK), entao o problema e apenas que as instancias precisam ser recriadas la dentro.

## Solucao

Adicionar uma funcao "Recriar Instancias Perdidas" que:

1. Seleciona todas as instancias com status `not_found_in_evolution`
2. Para cada uma, chama `global_create_instance` na Evolution API (apenas cria, sem inserir no banco pois ja existe)
3. Configura o webhook
4. Atualiza o status no banco para `awaiting_qr`

## Alteracoes

### 1. Edge Function: `supabase/functions/evolution-api/index.ts`

Adicionar nova action `global_recreate_instance` que:
- Recebe `instanceName` (obrigatorio)
- Cria a instancia na Evolution API via `/instance/create`
- Configura settings (groupsIgnore, etc)
- Configura webhook
- NAO insere no banco (a row ja existe)
- Atualiza o status da instancia existente para `awaiting_qr`
- Retorna sucesso com QR code se disponivel

### 2. Hook: `src/hooks/useGlobalAdminInstances.tsx`

Adicionar mutation `recreateAllLostInstances` que:
- Filtra instancias com status `not_found_in_evolution`
- Para cada uma, chama a nova action `global_recreate_instance`
- Exibe progresso e resultado via toast
- Invalida queries para atualizar a UI

### 3. Pagina: `src/pages/global-admin/GlobalAdminConnections.tsx`

Adicionar botao "Recriar Instancias Perdidas" visivel quando existem instancias com status `not_found_in_evolution`. O botao ficara junto aos existentes (Reaplicar Webhooks, Sincronizacao Completa).

## Fluxo esperado

```text
Botao "Recriar Instancias Perdidas" clicado
  |
  v
Para cada instancia "not_found_in_evolution":
  |
  +-- POST /instance/create (Evolution API)
  +-- POST /settings/set (groupsIgnore=true)
  +-- POST /webhook/set (webhook URL)
  +-- UPDATE whatsapp_instances SET status='awaiting_qr'
  |
  v
Toast: "6 de 8 instancias recriadas. Escaneie os QR Codes."
  |
  v
Usuarios podem gerar QR code normalmente pela plataforma
```

## Escopo

- 3 arquivos modificados
- 1 nova action na edge function (~60 linhas)
- 1 nova mutation no hook (~40 linhas)
- 1 novo botao na pagina (~10 linhas)
