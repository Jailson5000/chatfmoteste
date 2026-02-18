
# Adicionar Controles de IA nos Cards do Instagram e Facebook

## Situacao Atual

O backend ja esta completamente preparado:
- A tabela `meta_connections` ja possui os campos `default_handler_type`, `default_automation_id` e `default_human_agent_id`
- O webhook `meta-webhook` ja usa esses campos ao criar conversas novas (define `current_handler`, `current_automation_id` e `assigned_to`)
- O que falta e apenas o **frontend** expor esses controles nos cards de integracao

## O Que Sera Feito

Adicionar os mesmos dropdowns do Chat Web (Atendimento: Humano/Agente IA + selecao de agente) nos cards do Instagram DM e Facebook Messenger quando estiverem conectados.

### Mudanca 1: `IntegrationCard.tsx` - Aceitar conteudo extra

Adicionar uma prop `children` ao componente `IntegrationCard` para renderizar conteudo customizado (os dropdowns) dentro do card quando conectado.

### Mudanca 2: `InstagramIntegration.tsx` - Adicionar controles de IA

Quando conectado, exibir:
- Dropdown "Atendimento": Humano ou Agente IA
- Se "Agente IA": dropdown para selecionar qual agente
- Se "Humano": dropdown para selecionar responsavel

Ao mudar, atualizar os campos `default_handler_type`, `default_automation_id` e `default_human_agent_id` diretamente na tabela `meta_connections`.

### Mudanca 3: `FacebookIntegration.tsx` - Mesma logica

Identica ao Instagram: adicionar os mesmos controles de IA/Humano ao card do Facebook Messenger.

## Detalhes Tecnicos

### Componentes reutilizados
- `useAutomations()` - lista os agentes IA ativos
- `useTeamMembers()` - lista os membros da equipe
- `Select` do Radix UI - mesmos dropdowns ja usados no Chat Web

### Fluxo de dados
```text
Card Instagram/Facebook (frontend)
  |-- Update meta_connections.default_handler_type
  |-- Update meta_connections.default_automation_id
  |-- Update meta_connections.default_human_agent_id
  |
  v
meta-webhook (backend, ja implementado)
  |-- Nova conversa criada com current_handler = "ai" ou "human"
  |-- current_automation_id preenchido se IA
  |-- assigned_to preenchido se humano
```

### Valores padrao
- Conexoes existentes: `default_handler_type` e `null`, tratado como "human" (comportamento atual mantido)
- Ao mudar para "ai": limpa `default_human_agent_id`
- Ao mudar para "human": limpa `default_automation_id`

## Resultado

Os cards do Instagram e Facebook terao a mesma interface do Chat Web, com selecao de modo de atendimento e agente, sem necessidade de nenhuma mudanca no backend.
