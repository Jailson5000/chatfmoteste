

# Plano: Corrigir Atualização de Status, Etiquetas e Departamentos

## Problema Identificado

Ao criar um status, etiqueta ou departamento, eles não aparecem imediatamente para seleção no cliente. A causa principal é:

**As tabelas `custom_statuses`, `tags`, `departments`, `whatsapp_instances` e `scheduled_follow_ups` NÃO estão habilitadas para Supabase Realtime.**

O código do `RealtimeSyncContext` está corretamente configurado para escutar mudanças nessas tabelas, mas como elas não estão publicadas no `supabase_realtime`, nenhum evento é disparado.

## Evidência

Tabelas atualmente no Realtime:
- `agenda_pro_appointments`, `agenda_pro_clients`, `agenda_pro_professionals`, `agenda_pro_services`
- `ai_transfer_logs`, `appointments`, `client_actions`, `clients`
- `conversations`, `instance_status_history`, `messages`, `tray_chat_integrations`

Tabelas **ausentes** (necessárias pelo `RealtimeSyncContext`):
- `custom_statuses` ❌
- `tags` ❌
- `departments` ❌
- `whatsapp_instances` ❌
- `scheduled_follow_ups` ❌

## Solução

### Parte 1: Migração de Banco de Dados

Adicionar as tabelas faltantes à publicação `supabase_realtime`:

```sql
-- Habilitar Realtime para tabelas de configuração
ALTER PUBLICATION supabase_realtime ADD TABLE custom_statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE tags;
ALTER PUBLICATION supabase_realtime ADD TABLE departments;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_follow_ups;
```

### Parte 2: Garantir Invalidação Correta nas Mutações

Verificar e ajustar os hooks para invalidar com o prefixo correto. A invalidação atual está correta (`queryClient.invalidateQueries({ queryKey: ["custom_statuses"] })`) e faz match por prefixo com `["custom_statuses", lawFirm.id]`.

**Nenhuma alteração necessária nos hooks** - a lógica de invalidação está funcionando.

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| Nova migração SQL | Adicionar 5 tabelas ao Realtime |

## Fluxo Após a Correção

```text
┌─────────────────────────────────────────────────────────────────┐
│           Usuário cria Status em Settings                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     1. createStatus.mutateAsync() executa                       │
│     2. INSERT no banco de dados                                 │
│     3. onSuccess: invalidateQueries(["custom_statuses"])        │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┴────────────────────┐
          ▼                                         ▼
┌───────────────────────────┐         ┌───────────────────────────┐
│  Invalidação imediata     │         │  Evento Realtime          │
│  na mesma aba             │         │  para outras abas/users   │
│  (já funciona)            │         │  (AGORA FUNCIONARÁ)       │
└───────────────────────────┘         └───────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│        Lista de status atualizada em todas as telas             │
│        (Settings, Conversations, Kanban)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Risco

**Baixo** - Apenas adiciona tabelas à publicação Realtime existente. Não altera schema, RLS ou dados. A alteração permite que eventos de mudança sejam propagados corretamente.

## Testes Recomendados

1. Criar um novo status em Settings
2. Verificar se aparece imediatamente na lista de status em Settings
3. Ir para Conversations e verificar se o novo status aparece no painel de detalhes do contato
4. Abrir duas abas - criar status em uma e verificar se aparece na outra

