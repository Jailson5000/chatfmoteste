# Manual Completo do Painel do Cliente - MiauChat

Este documento explica detalhadamente todas as funcionalidades disponíveis no painel do cliente.

---

## 📊 DASHBOARD

**Localização:** Menu lateral → Dashboard

### O que mostra:

| Seção | Descrição |
|-------|-----------|
| **Cards de Métricas** | Total de conversas, conversas ativas, conversas com IA, tempo médio de resposta |
| **Gráfico de Conversas** | Evolução das conversas ao longo do tempo (filtro por período) |
| **Mapa do Brasil** | Distribuição geográfica dos clientes por estado (baseado no DDD do telefone) |
| **Conversas Recentes** | Lista das últimas conversas com status e responsável |
| **Performance por Agente** | Métricas de cada agente de IA (mensagens processadas, tempo de resposta) |

### Como funciona:
- Os dados são atualizados em **tempo real**
- O filtro de data permite visualizar métricas de períodos específicos
- Clicando em uma conversa recente, você é redirecionado para o chat

---

## 💬 ATENDIMENTOS

### 1. CONVERSAS

**Localização:** Menu lateral → Conversas

A tela de conversas é dividida em **3 painéis**:

```
┌─────────────┬──────────────────────┬─────────────┐
│   LISTA     │        CHAT          │  DETALHES   │
│  (320px)    │      (flexível)      │   (320px)   │
└─────────────┴──────────────────────┴─────────────┘
```

#### Painel Esquerdo - Lista de Conversas

Possui **3 abas**:

| Aba | Descrição | Filtro Aplicado |
|-----|-----------|-----------------|
| **Fila** | Conversas aguardando atendimento humano | `current_handler = 'human'` + não arquivadas |
| **IA** | Conversas sendo atendidas pela IA | `current_handler = 'ai'` + não arquivadas |
| **Arquivadas** | Conversas finalizadas/arquivadas | `archived_at IS NOT NULL` |

**Informações no card de cada conversa:**
- Nome do cliente (truncado)
- Última mensagem (prévia)
- Horário da última mensagem
- Status do cliente (badge colorido)
- Departamento (badge)
- Tags (badges)
- Indicador de origem (📱 WhatsApp ou 🌐 Web)
- Nome da instância WhatsApp conectada

#### Painel Central - Chat

**Cabeçalho do Chat:**
- Nome do cliente
- Telefone (clicável para copiar)
- Status atual (IA ou Humano)
- Indicador de modo áudio IA (se ativo)
- Botão para transferir entre IA ↔ Humano

**Área de Mensagens:**
- Mensagens do cliente (alinhadas à esquerda, fundo cinza)
- Mensagens enviadas (alinhadas à direita, fundo azul/primário)
- Mensagens da IA (alinhadas à direita, com badge "IA")
- Suporte a: texto, imagens, áudios, documentos, vídeos
- Indicador de "digitando..." quando IA está processando

**Barra de Envio:**
- Campo de texto
- Botão de emoji
- Botão de anexo (imagens, documentos)
- Botão de gravação de áudio
- Botão de enviar

#### Painel Direito - Detalhes do Contato

- **Informações do Cliente:**
  - Nome, telefone, email
  - CPF/CNPJ
  - Endereço
  - Notas internas

- **Status e Departamento:**
  - Seletor de status personalizado (dropdown)
  - Seletor de departamento (dropdown)

- **Tags:**
  - Tags atribuídas ao cliente
  - Botão para adicionar/remover tags

- **Histórico de Ações:**
  - Registro de todas as alterações feitas no cliente
  - Quem fez, quando e o que mudou

---

### Como Funciona o Fluxo de Atendimento

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOVA MENSAGEM CHEGA                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Webhook recebe (WhatsApp ou Tray)                              │
│  → Identifica/cria conversa                                     │
│  → Identifica/cria cliente                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  current_handler = 'ai' ?                                       │
│  ├─ SIM → IA processa e responde automaticamente               │
│  └─ NÃO → Conversa vai para ABA "FILA" aguardar humano         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Atendente pode:                                                │
│  → Transferir para IA (botão no cabeçalho)                     │
│  → Transferir para Humano (botão no cabeçalho)                 │
│  → Arquivar conversa (com motivo)                              │
└─────────────────────────────────────────────────────────────────┘
```

#### Diferença entre as Abas:

| Aspecto | Aba FILA | Aba IA |
|---------|----------|--------|
| **Quem responde** | Atendente humano | Agente de IA |
| **current_handler** | `human` | `ai` |
| **Aparece quando** | Cliente solicitou humano OU IA transferiu | Conversa nova OU transferida para IA |
| **Ação do atendente** | Responder manualmente | Monitorar OU intervir se necessário |

---

### 2. KANBAN

**Localização:** Menu lateral → Kanban

O Kanban organiza clientes por **departamento** (colunas) visualmente.

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  Comercial  │   Suporte   │  Financeiro │   Jurídico  │
├─────────────┼─────────────┼─────────────┼─────────────┤
│  Cliente A  │  Cliente D  │  Cliente G  │  Cliente J  │
│  Cliente B  │  Cliente E  │  Cliente H  │             │
│  Cliente C  │  Cliente F  │  Cliente I  │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

#### Funcionalidades:

| Ação | Como Fazer |
|------|------------|
| **Mover cliente** | Arrastar e soltar entre colunas |
| **Ver detalhes** | Clicar no card do cliente |
| **Filtrar** | Usar filtros por status, tags, período |
| **Criar departamento** | Botão "+ Novo Departamento" |
| **Arquivar** | No painel de detalhes do cliente |

#### Card do Cliente no Kanban:

- Nome do cliente
- Telefone
- Status personalizado (badge colorido)
- Tags atribuídas
- Última interação
- Instância WhatsApp vinculada
- Botão para abrir conversa

---

### 3. CONTATOS

**Localização:** Menu lateral → Contatos

Lista completa de todos os clientes/contatos da empresa.

#### Funcionalidades:

| Ação | Descrição |
|------|-----------|
| **Buscar** | Campo de pesquisa por nome ou telefone |
| **Filtrar** | Por status, departamento, tags |
| **Exportar** | Baixar lista em Excel/CSV |
| **Editar** | Clicar no contato para editar dados |
| **Excluir** | Remove contato e TODAS as conversas associadas (cascata) |
| **Unificar** | Mesclar contatos duplicados (mesmo telefone normalizado) |
| **Iniciar Conversa** | Abre chat com o contato selecionado |

#### Dados de cada Contato:

- Nome
- Telefone (normalizado com +55)
- Email
- CPF/CNPJ
- Endereço
- Estado (detectado pelo DDD)
- Status personalizado
- Departamento
- Tags
- Notas internas
- Data de cadastro
- Última interação

---

## 🤖 IA (Agentes de IA)

**Localização:** Menu lateral → Agentes de IA

### O que é um Agente de IA?

É uma automação que responde mensagens automaticamente usando inteligência artificial, seguindo instruções específicas (prompt).

### Tela de Listagem:

- Cards com cada agente criado
- Status: Ativo/Inativo (toggle)
- Nome e descrição
- Pasta organizacional (opcional)
- Botão editar/excluir

### Criando/Editando um Agente:

#### Aba "Configurações":

| Campo | Descrição |
|-------|-----------|
| **Nome** | Nome identificador do agente |
| **Descrição** | Breve descrição do propósito |
| **Prompt** | Instruções detalhadas para a IA (personalidade, regras, limitações) |
| **Temperatura** | 0.0 a 1.0 - Quanto maior, mais criativo (padrão: 0.7) |
| **Ativo** | Liga/desliga o agente |

#### Aba "Base de Conhecimento":

Permite vincular itens de conhecimento ao agente:
- Documentos, FAQs, textos
- A IA usa esse conhecimento para responder com mais precisão
- Cada agente pode ter bases diferentes

#### Exemplo de Prompt:

```
Você é a assistente virtual da Clínica Bem-Estar.

REGRAS:
- Seja sempre educada e profissional
- Responda apenas sobre serviços da clínica
- Para agendamentos, pergunte: nome, telefone, especialidade desejada
- Se não souber algo, diga que vai verificar e transferir para atendente
- Nunca invente informações sobre preços ou disponibilidade

SERVIÇOS OFERECIDOS:
- Clínica Geral
- Dermatologia
- Cardiologia
- Pediatria

HORÁRIO DE FUNCIONAMENTO:
Segunda a Sexta: 8h às 18h
Sábado: 8h às 12h
```

---

## 📚 BASE DE CONHECIMENTO

**Localização:** Menu lateral → Base de Conhecimento

### O que é?

Repositório de informações que os agentes de IA podem consultar para responder perguntas.

### Tipos de Itens:

| Tipo | Descrição | Uso |
|------|-----------|-----|
| **Texto** | Conteúdo escrito diretamente | FAQs, políticas, procedimentos |
| **Arquivo** | PDF, DOC, TXT enviados | Manuais, contratos, tabelas |

### Campos de cada Item:

- **Título**: Nome identificador
- **Categoria**: Organização (ex: "Produtos", "Políticas", "FAQ")
- **Conteúdo**: O texto ou arquivo em si

### Como a IA usa:

1. Agente recebe uma pergunta
2. Sistema busca itens vinculados ao agente
3. Conteúdo relevante é incluído no contexto da IA
4. IA responde usando esse conhecimento

---

## 🎤 VOZ IA

**Localização:** Menu lateral → Voz IA

### O que é?

Permite que a IA responda com **áudio** em vez de texto.

### Configurações:

| Opção | Descrição |
|-------|-----------|
| **Ativar Voz IA** | Liga/desliga globalmente |
| **Voz Selecionada** | Escolha entre vozes disponíveis (masculina/feminina, idiomas) |
| **Teste** | Botão para ouvir prévia da voz selecionada |

### Como funciona:

1. IA gera resposta em texto
2. Texto é convertido em áudio (Text-to-Speech)
3. Áudio é enviado ao cliente no WhatsApp

### Ativar por Conversa:

- No cabeçalho do chat, há um indicador de "Modo Áudio"
- Pode ser ativado/desativado por conversa individual
- Útil para clientes que preferem ouvir em vez de ler

---

## ⚙️ CONFIGURAÇÕES

**Localização:** Menu lateral → Configurações

---

### 📱 INTEGRAÇÕES

#### 1. Chat no Site (Tray Commerce)

**O que é:**
Widget de chat que pode ser instalado em lojas Tray Commerce para atender clientes do site.

**Como ativar:**

1. Acesse Configurações → Integrações
2. Encontre o card "Chat no Site (Tray)"
3. Clique no toggle para ativar
4. Copie o código do snippet

**Código do Snippet:**
```html
<!-- MiauChat Widget - Tray Commerce -->
<script>
  window.MiauChat = {
    tenant: "SEU_WIDGET_KEY",
    source: "TRAY",
    pageUrl: window.location.href,
    referrer: document.referrer,
    device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop"
  };
</script>
<script async src="https://miauchat.com.br/widget.js"></script>
```

**Onde instalar:**
- No painel admin da Tray Commerce
- Seção de scripts personalizados ou footer
- Cole o código antes do `</body>`

**Configurações Padrão:**
Clique no botão "Configurações" para definir:

| Configuração | Descrição |
|--------------|-----------|
| **Departamento Padrão** | Novos atendimentos do site vão para qual departamento |
| **Status Padrão** | Status inicial dos leads do site |
| **Agente IA Padrão** | Qual IA vai responder automaticamente |

**Como funciona o atendimento:**

```
┌─────────────────────────────────────────────────────────────┐
│  Visitante acessa o site                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Widget aparece no canto da tela                            │
│  → Visitante clica e abre o chat                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Visitante envia primeira mensagem                          │
│  → Sistema gera visitor_id único                           │
│  → Cria conversa com origin = "tray"                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  IA configurada responde automaticamente                    │
│  → Usa o prompt e conhecimento do agente selecionado       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Conversa aparece no painel                                 │
│  → Na aba "IA" (se handler = ai)                           │
│  → Identificada com ícone 🌐 Web                           │
└─────────────────────────────────────────────────────────────┘
```

**Identificação dos visitantes:**

| Aspecto | WhatsApp | Site (Tray) |
|---------|----------|-------------|
| **Identificador** | Telefone | visitor_id (gerado) |
| **remote_jid** | `5511999...@s.whatsapp.net` | `visitor_abc123@web` |
| **origin** | `whatsapp` | `tray` |
| **Persistência** | Permanente | Sessão do navegador |

---

#### 2. Google Calendar

**O que é:**
Integração que permite a IA agendar, editar e cancelar eventos no Google Calendar da empresa.

**Como conectar:**

1. Acesse Configurações → Integrações
2. Encontre o card "Google Calendar"
3. Clique em "Conectar"
4. Faça login com sua conta Google
5. Autorize as permissões solicitadas

**Permissões configuráveis:**

| Permissão | Descrição |
|-----------|-----------|
| **Leitura** | IA pode consultar agenda e horários disponíveis |
| **Criação** | IA pode criar novos eventos |
| **Edição** | IA pode modificar eventos existentes |
| **Exclusão** | IA pode cancelar eventos |

**Como a IA usa:**

Quando um cliente pede para agendar, a IA:

1. Consulta horários disponíveis no calendário
2. Sugere opções ao cliente
3. Cria o evento com título, data, horário
4. Confirma o agendamento ao cliente

**Exemplo de conversa:**

```
Cliente: Quero agendar uma consulta para amanhã
IA: Claro! Temos horários disponíveis amanhã:
    - 09:00
    - 11:00
    - 14:30
    - 16:00
    Qual prefere?

Cliente: 14:30
IA: Perfeito! Agendei sua consulta para amanhã às 14:30.
    Você receberá um lembrete por email.
    Posso ajudar em mais alguma coisa?
```

**Visualização no Painel:**

- Menu lateral → Calendário
- Mostra todos os eventos sincronizados
- Indica quais foram criados pela IA
- Permite visualização por dia, semana ou mês

---

### 👥 Equipe

Gerenciamento de usuários que têm acesso ao painel.

| Ação | Descrição |
|------|-----------|
| **Convidar** | Envia email de convite para novo membro |
| **Definir Função** | Admin ou Atendente |
| **Vincular Departamento** | Quais departamentos o usuário pode ver |
| **Desativar** | Remove acesso sem excluir histórico |

---

### 🏢 Empresa

Dados cadastrais da empresa.

- Nome da empresa
- CNPJ
- Telefone
- Email
- Endereço
- Logo

---

### 🏷️ Status Personalizados

Crie status para classificar clientes no funil.

**Exemplos:**
- 🟡 Novo Lead
- 🔵 Em Análise
- 🟢 Qualificado
- 🟣 Proposta Enviada
- ✅ Fechado/Ganho
- ❌ Perdido

---

### 📁 Departamentos

Organize o atendimento por setores.

**Exemplos:**
- Comercial
- Suporte
- Financeiro
- Jurídico
- Técnico

Cada departamento pode ter:
- Cor identificadora
- Ícone
- Membros vinculados

---

### 🏷️ Tags

Etiquetas para categorizar clientes.

**Exemplos:**
- VIP
- Recorrente
- Inadimplente
- Indicação
- Promocional

---

### 📝 Templates

Mensagens prontas para envio rápido.

**Como usar:**
1. Crie templates com texto padrão
2. No chat, clique no ícone de template
3. Selecione o template desejado
4. Mensagem é inserida automaticamente

**Suporta variáveis:**
- `{{nome}}` - Nome do cliente
- `{{empresa}}` - Nome da empresa

---

## 🔄 FLUXO COMPLETO DE ATENDIMENTO

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENTE ENVIA MENSAGEM                       │
│                  (WhatsApp ou Chat do Site)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ┌──────────────┐               ┌──────────────┐
       │   WhatsApp   │               │   Site Tray  │
       │              │               │              │
       │ Telefone     │               │ visitor_id   │
       │ real         │               │ gerado       │
       └──────────────┘               └──────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Webhook recebe e processa                                       │
│  → Cria/atualiza conversa                                       │
│  → Cria/atualiza cliente                                        │
│  → Aplica departamento e status padrão                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Handler = AI ?                                                  │
│  ├─ SIM → Agente IA responde automaticamente                    │
│  │        → Pode consultar base de conhecimento                 │
│  │        → Pode agendar no Google Calendar                     │
│  │        → Pode enviar áudio (se Voz IA ativa)                │
│  └─ NÃO → Aguarda atendente humano na FILA                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Conversa aparece no painel                                      │
│  → Atendente pode monitorar, intervir, transferir               │
│  → Pode mover cliente entre departamentos (Kanban)              │
│  → Pode adicionar tags, status, notas                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Atendimento concluído                                           │
│  → Arquivar conversa (com motivo)                               │
│  → Cliente mantém histórico para próximos contatos              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 RESUMO DAS FUNCIONALIDADES

| Área | Funcionalidade Principal |
|------|-------------------------|
| **Dashboard** | Métricas e visão geral |
| **Conversas** | Atendimento em tempo real (Fila, IA, Arquivadas) |
| **Kanban** | Gestão visual por departamento |
| **Contatos** | Base de clientes (CRUD completo) |
| **Agentes IA** | Configuração de automações inteligentes |
| **Base Conhecimento** | Repositório de informações para IA |
| **Voz IA** | Respostas em áudio |
| **Calendário** | Visualização de eventos sincronizados |
| **Configurações** | Empresa, equipe, integrações, personalizações |

---

*Documento gerado em Janeiro/2026 - MiauChat v1.0*
