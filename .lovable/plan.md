
# Correções e Melhorias no Módulo de Agentes de IA

## Resumo dos Problemas Identificados

Após análise detalhada do código, identifiquei os seguintes pontos que precisam de atenção:

| Item | Status | Descrição |
|------|--------|-----------|
| Menções (@) | ✅ OK | Sistema funcionando corretamente |
| Palavras-chave | ✅ OK | Campo funcional e salvando corretamente |
| Tempo de Delay | ✅ OK | Configuração funcionando |
| Canal de Atendimento | ✅ OK | Opções implementadas corretamente |
| Agenda Pro | ✅ OK | Toggle funcionando |
| Base de Conhecimento | ⚠️ Problema | Possível dessincronização entre fontes |
| Avisar Cliente | ⚠️ Verificar | Toggle existe, mas precisa validar uso no backend |
| Campo do Prompt (UX) | ⚠️ Melhorar | Falta formatação rica e tema escuro ruim |

---

## Problema 1: Base de Conhecimento - Dessincronização

### Descrição do Problema
Existem **duas fontes de dados** para o conhecimento vinculado a um agente:

1. **Tabela `agent_knowledge`**: Usada pelo `AgentKnowledgeSection.tsx` e pela página `KnowledgeBase.tsx` (vincular/desvincular agentes)

2. **Campo `trigger_config.knowledge_base_ids`**: Array salvo junto com as outras configurações do agente em `AIAgents.tsx`

Isso significa que quando você desvincula uma base de conhecimento na página "Base de Conhecimento > Vincular Agentes", essa ação **não atualiza** o campo `trigger_config.knowledge_base_ids`, causando a dessincronização observada.

### Solução Proposta
**Opção A (Recomendada)**: Remover `knowledge_base_ids` do `trigger_config` e usar apenas a tabela `agent_knowledge` como fonte única de verdade.

Alterações necessárias:
- `AIAgents.tsx`: Remover o estado `selectedKnowledge` e a seção de checkboxes de base de conhecimento
- O `AgentKnowledgeSection.tsx` já cuida dessa funcionalidade corretamente
- `AIAgentEdit.tsx`: Já usa `AgentKnowledgeSection` como fonte única

---

## Problema 2: Campo do Prompt - UX Melhorada

### Descrição do Problema
O campo de prompt atual (`MentionEditor`) é uma div contenteditable básica que:
- Não oferece formatação rica (negrito, itálico, listas)
- No tema escuro, o contraste pode ser insuficiente
- Não tem toolbar de formatação

### Solução Proposta
Melhorar o `MentionEditor` com:

1. **Toolbar de Formatação Básica**:
   - Botão de negrito (**B**)
   - Botão de itálico (*I*)
   - Botão de lista
   
2. **Melhorias de Estilo para Tema Escuro**:
   - Adicionar classe `dark:bg-slate-900` ao container
   - Garantir contraste do placeholder
   - Melhorar a borda e foco

3. **Melhorias Visuais Gerais**:
   - Adicionar contador de caracteres mais visível
   - Melhorar padding e espaçamento

### Arquivos a Modificar
- `src/components/ai-agents/MentionEditor.tsx`

---

## Problema 3: Avisar Cliente ao Transferir - Validação

### Descrição do Problema
O toggle "Avisar ao transferir" existe na interface e salva o campo `notify_on_transfer` no banco. Precisamos verificar se:
1. O backend realmente usa esse campo
2. A mensagem de notificação está sendo enviada

### Ação
- Verificar o fluxo no N8N/backend que processa transferências
- Se não estiver implementado, está funcionando como "desativado" mesmo quando ativo (sem efeito)

O campo está corretamente implementado no frontend. A implementação no backend depende do workflow N8N configurado pela empresa.

---

## Arquivos que Precisam de Alteração

| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `src/pages/AIAgents.tsx` | Remover seção duplicada de base de conhecimento para evitar dessincronização |
| `src/components/ai-agents/MentionEditor.tsx` | Adicionar toolbar de formatação e melhorar tema escuro |

---

## Mudanças Detalhadas

### 1. AIAgents.tsx - Remover Conhecimento Duplicado

**Remover** (linhas ~1630-1693 aproximadamente):
- A seção inteira de "Base de Conhecimento" que usa checkboxes
- O estado `selectedKnowledge` (linha 287)
- A referência a `knowledge_base_ids` no `handleSave` (linha ~724)

**Por quê**: O `AgentKnowledgeSection` dentro do `AIAgentEdit.tsx` já gerencia isso corretamente usando a tabela `agent_knowledge`. Manter duas formas de vincular conhecimento causa confusão e dessincronização.

### 2. MentionEditor.tsx - Melhorias Visuais

Adicionar toolbar com botões de formatação:

```text
┌─────────────────────────────────────────────────┐
│ [B] [I] [Lista] [Ajuda @]           📝 2340/10000 │
├─────────────────────────────────────────────────┤
│                                                 │
│  Área do Prompt com contenteditable            │
│  (menções em badges coloridos)                  │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

Melhorias no container:
- `bg-background dark:bg-slate-900/50` para melhor contraste
- `border-input dark:border-slate-700` para borda visível
- `placeholder:text-muted-foreground` para texto de ajuda legível

---

## Resumo das Garantias

1. **Sem Regressões**: Todas as alterações são isoladas aos arquivos de agentes de IA
2. **Compatibilidade**: O código existente continua funcionando
3. **Fonte Única de Verdade**: Base de conhecimento agora tem uma única fonte (`agent_knowledge`)
4. **UX Melhorada**: Prompt mais fácil de editar em ambos os temas

---

## Sequência de Implementação

1. **Fase 1**: Remover a seção duplicada de base de conhecimento em `AIAgents.tsx`
2. **Fase 2**: Melhorar visual do `MentionEditor.tsx` (tema escuro + toolbar básica)
3. **Fase 3**: Testar o fluxo completo para garantir que funciona
