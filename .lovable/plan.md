

# Análise dos 10 Pontos - Classificação por Risco e Complexidade

## Resumo Executivo

| # | Problema | Risco | Complexidade | Prioridade |
|---|---------|-------|-------------|------------|
| 1 | Intervenção pontual nao envia imagem/arquivo/audio sem marcacao | Baixo | Media | Alta |
| 2 | Kanban nao atualiza em tempo real (sem arrastar) | Baixo | Baixa | Alta |
| 3 | Quantidade de IAs nos planos | N/A | N/A | N/A |
| 4 | Arquivos apagados pelo cliente somem | Alto | Alta | Media |
| 5 | Remover badge de anuncio do card | Baixo | Media | Baixa |
| 6 | X para limpar pesquisa em conversas | Baixo | Baixa | Alta |
| 7 | A partir de 3 meses implementacao inclusa | Baixo | Baixa | Media |
| 8 | Editar mensagens enviadas | Medio | Alta | Baixa |
| 9 | Templates no Kanban | Medio | Alta | Media |
| 10 | Contato salva na instancia errada | Baixo | Baixa | Alta |

---

## PONTO 3: Quantidade de IAs nos Planos - JA RESOLVIDO

Os planos no banco de dados **ja incluem** a quantidade de agentes de IA nas features:
- PRIME: "1 agente de IA"
- BASIC: "1 agente de IA"  
- STARTER: "2 agentes de IA"
- PROFESSIONAL: "4 agentes de IA"
- ENTERPRISE: "10 agentes de IA"

Essas features ja aparecem na landing page. **Nenhuma alteracao necessaria.**

---

## PONTO 6: X para Limpar Pesquisa em Conversas (Risco: Baixo)

### Problema
O campo de busca de conversas na sidebar nao tem botao X para limpar o texto depois de pesquisar.

### Solucao
Adicionar botao X ao campo de busca, igual ao que ja existe no Kanban (linhas 399-408 de `Kanban.tsx`).

### Arquivo
`src/pages/Conversations.tsx` - Linhas ~2800-2806 (mobile) e ~3306-3311 (desktop)

### Mudanca
Adicionar condicionalmente um botao X dentro do `div relative` do campo de busca, quando `searchQuery` nao estiver vazio.

---

## PONTO 10: Contato Salva na Instancia Errada (Risco: Baixo)

### Problema
No `NewContactDialog`, o usuario seleciona uma instancia/conexao, mas o `handleCreateFromPhone` em `Contacts.tsx` ignora essa selecao. O `onCreate` callback so recebe `phone`, sem a `selectedConnection`.

### Solucao
1. Modificar o componente `NewContactDialog` para passar o `selectedConnection` junto com o `phone` no callback `onCreate`
2. Modificar a interface `NewContactDialogProps` para que `onCreate` aceite `(phone: string, connectionId?: string)`
3. Em `Contacts.tsx`, receber o `connectionId` e incluir no `createClient` como `whatsapp_instance_id`
4. Em `Kanban.tsx`, receber o `connectionId` e passar na URL de navegacao

### Arquivos
- `src/components/contacts/NewContactDialog.tsx` - Alterar callback
- `src/pages/Contacts.tsx` - Receber e usar connectionId  
- `src/pages/Kanban.tsx` - Receber e usar connectionId

---

## PONTO 1: Intervencao Pontual - Imagem/Arquivo/Audio (Risco: Baixo)

### Problema
Tres sub-problemas:
1. **Imagem e arquivo**: `handleSendMedia` (linha 1909) sempre faz `transferHandler` para humano, ignorando `isPontualMode`. Nao passa `is_pontual` para o backend.
2. **Audio**: `handleSendAudioRecording` (linha 2334) tambem nao verifica `isPontualMode` e nao passa `is_pontual`.
3. **Media preview**: `handleSendMediaPreview` tambem ignora `isPontualMode`.

### Solucao
Nos tres handlers (`handleSendMedia`, `handleSendMediaPreview`, `handleSendAudioRecording`):
1. Capturar `wasPontualMode = isPontualMode` no inicio
2. Condicionar o `transferHandler` com `!wasPontualMode`
3. Incluir `is_pontual: wasPontualMode` na mensagem otimista e no insert do banco

### Arquivo
`src/pages/Conversations.tsx` - Funcoes handleSendMedia (~1909), handleSendMediaPreview, handleSendAudioRecording (~2334)

---

## PONTO 2: Kanban Nao Atualiza em Tempo Real (Risco: Baixo)

### Problema
Quando o usuario move um cliente para outro departamento **sem arrastar** (ex: via select/dropdown no `ClientDetailSheet`), o Kanban nao atualiza visualmente.

### Analise
O Realtime ja esta configurado: `RealtimeSyncContext` escuta mudancas na tabela `conversations` e invalida queries. Isso deveria funcionar. O problema provavel e que a funcao de update nao esta invalidando o cache corretamente, ou o `useConversations` nao esta reagindo a invalidacao.

### Solucao
Verificar se `updateConversationDepartment` no `useConversations` chama `queryClient.invalidateQueries` apos o update. Se nao, adicionar invalidacao explicita. Tambem verificar se o `ClientDetailSheet` usa a mesma mutacao.

### Arquivo
`src/hooks/useConversations.tsx` - Verificar mutacoes de update

---

## PONTO 7: A Partir de 3 Meses Implementacao Inclusa (Risco: Baixo)

### Problema
Precisa adicionar informacao na landing page de que planos a partir de 3 meses incluem configuracao e implementacao.

### Solucao
Adicionar um banner/nota na secao de planos, apos o banner do plano anual, informando que assinaturas de 3+ meses incluem implementacao gratuita.

### Arquivo
`src/pages/landing/LandingPage.tsx` - Apos o banner do plano anual (~linha 695)

---

## PONTO 5: Remover Badge de Anuncio do Card (Risco: Baixo)

### Problema
Quando um cliente chega via anuncio do Facebook, o badge de anuncio fica permanente. Precisa de uma opcao para remover/marcar como "ja atendido".

### Solucao
Adicionar um botao de "dispensar" no `AdClickBanner` que limpa o campo `origin_metadata` (ou adiciona um flag `ad_dismissed`) na conversa.

### Arquivos
- `src/components/conversations/AdClickBanner.tsx` - Adicionar botao dismiss
- Banco de dados: Possivelmente adicionar campo `ad_dismissed` na tabela conversations ou limpar `origin_metadata`

---

## PONTO 4: Salvar Arquivos Enviados pelo Cliente (Risco: Alto)

### Problema
Quando o cliente apaga uma mensagem (midia) no WhatsApp, o arquivo desaparece do sistema porque a URL da midia se torna invalida.

### Analise
Isso e uma mudanca arquitetural significativa. Atualmente, o sistema armazena apenas a `media_url` retornada pela API do WhatsApp, que e temporaria. Para preservar arquivos, seria necessario:
1. No webhook de recebimento, fazer download da midia
2. Salvar no Storage do backend
3. Atualizar a `media_url` para apontar para o Storage

### Risco
Alto - envolve mudanca no webhook de recebimento, gerenciamento de storage, custos de armazenamento, e impacto em performance.

### Recomendacao
Implementar em uma fase separada, com planejamento cuidadoso de storage e custos.

---

## PONTO 8: Editar Mensagens Enviadas (Risco: Medio)

### Analise
A Evolution API suporta edicao de mensagens com limitacoes:
- Apenas mensagens de texto
- Janela de tempo limitada (15 min)
- Apenas mensagens enviadas por nos

### Recomendacao
Adiar para fase futura por risco de instabilidade e complexidade na UI (historico de edicoes, sincronizacao).

---

## PONTO 9: Templates no Kanban (Risco: Medio)

### Problema
O `KanbanChatPanel` nao tem suporte ao envio de templates/mensagens rapidas (o componente `TemplatePopup` so existe no `Conversations.tsx`).

### Recomendacao
Implementar em fase separada pois requer integrar o sistema de templates no KanbanChatPanel, que e um componente grande e complexo.

---

## Plano de Implementacao (Fase 1 - Itens Seguros)

Itens a implementar agora, em ordem:

1. **Ponto 6** - X para limpar pesquisa (mais simples, 0 risco)
2. **Ponto 10** - Contato salva na instancia correta (baixo risco)
3. **Ponto 1** - Intervencao pontual com midia (baixo risco, padrao ja existe para texto)
4. **Ponto 7** - Banner implementacao inclusa na landing page (0 risco)
5. **Ponto 2** - Kanban realtime sem arrastar (investigar e corrigir)
6. **Ponto 5** - Remover badge de anuncio (baixo risco)

### Itens para Fase Posterior

- **Ponto 4** (Salvar arquivos) - Requer planejamento de storage
- **Ponto 8** (Editar mensagens) - Limitacoes tecnicas da API
- **Ponto 9** (Templates no Kanban) - Complexidade alta

### Ponto Ja Resolvido

- **Ponto 3** (IAs nos planos) - Ja esta correto no banco e na landing page

## Detalhes Tecnicos

### Arquivos a Modificar (Fase 1)

| Arquivo | Pontos |
|---------|--------|
| `src/pages/Conversations.tsx` | 1, 6 |
| `src/components/contacts/NewContactDialog.tsx` | 10 |
| `src/pages/Contacts.tsx` | 10 |
| `src/pages/Kanban.tsx` | 10 |
| `src/pages/landing/LandingPage.tsx` | 7 |
| `src/components/conversations/AdClickBanner.tsx` | 5 |
| `src/hooks/useConversations.tsx` | 2 |

