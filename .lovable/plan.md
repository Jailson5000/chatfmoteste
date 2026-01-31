
# Plano: Criar Templates de Agentes de IA para Clientes

## Diagnóstico do Problema

Você salvou um template no **Template Base** (`ai_template_base`), que é usado para configurar novas empresas no momento do provisioning. Isso funciona corretamente para o propósito de setup inicial.

Porém, os **templates que os clientes veem** na aba "Templates" (dentro de Agentes de IA) vêm de outra tabela: **`agent_templates`**.

Atualmente existe apenas 1 template nessa tabela:
- "Agente de Agendamento" (já cadastrado, ativo e em destaque)

---

## O Que Será Feito

### 1. Criar 2 Novos Templates de Agentes

Inserir na tabela `agent_templates` os seguintes templates:

#### Template 1: Agente Simples de Atendimento

| Campo | Valor |
|-------|-------|
| Nome | Agente de Atendimento |
| Descrição | Agente para triagem inicial de leads e clientes. Identifica se é cliente ou novo contato e direciona para o departamento correto. |
| Categoria | atendimento |
| Ícone | headphones |
| Destaque | Sim |
| Prompt | Template com etiquetas substituíveis |

**Prompt proposto:**
```text
Você é um agente inteligente de atendimento da @empresa, responsável pela triagem dos leads e clientes que enviam mensagem no WhatsApp.

## 👋 Início do Atendimento

1. Cumprimente o cliente de forma cordial
2. Pergunte: "Você já é nosso cliente ou está buscando saber mais sobre nossos serviços?"

### Se já é cliente:
- Altere o status para @status [NOME_DO_STATUS_SUPORTE]
- Altere o departamento para @departamento [NOME_DO_DEPARTAMENTO_SUPORTE]
- Peça o CPF ou identificação para localizar o cadastro
- Mensagem: "Ótimo! Me confirme seu CPF que um de nossos especialistas já irá lhe atender."

### Se não é cliente (novo lead):
- Altere o status para @status [NOME_DO_STATUS_NOVO]
- Altere o departamento para @departamento [NOME_DO_DEPARTAMENTO_VENDAS]
- Pergunte sobre o interesse: "Perfeito! Sobre qual assunto gostaria de mais informações?"

## Diretrizes Gerais
- Seja sempre educado e profissional
- Responda de forma clara e objetiva
- Use emojis com moderação para humanizar a conversa
- Se não souber responder, informe que vai encaminhar para um atendente humano

## Variáveis Disponíveis
- @nome - Nome do contato
- @empresa - Nome da empresa
- @status [nome] - Altera o status do cliente
- @departamento [nome] - Altera o departamento
```

---

#### Template 2: Agente de Agendamento (Atualizado)

O template existente será mantido, mas vou verificar se precisa de ajustes para incluir etiquetas substituíveis.

---

### 2. Adicionar Link para Admin Global > Templates de Agentes

Garantir que a navegação no menu global admin tenha fácil acesso a essa página.

---

## Arquivos que Serão Modificados

| Arquivo | Ação |
|---------|------|
| **Banco de Dados** | INSERT em `agent_templates` via SQL |

## Dados SQL a Serem Inseridos

```sql
INSERT INTO agent_templates (
  name,
  description,
  icon,
  ai_prompt,
  ai_temperature,
  response_delay_seconds,
  trigger_type,
  trigger_config,
  voice_enabled,
  category,
  tags,
  is_active,
  is_featured,
  display_order
) VALUES (
  'Agente de Atendimento',
  'Agente para triagem inicial de leads e clientes. Identifica se é cliente ou novo contato e direciona para o departamento correto.',
  'headphones',
  'Você é um agente inteligente de atendimento da @empresa...',
  0.7,
  2,
  'message_received',
  '{"keywords": ["olá", "oi", "bom dia", "boa tarde", "boa noite"]}',
  false,
  'atendimento',
  '{}',
  true,
  true,
  0
);
```

---

## Fluxo de Onde os Templates Aparecem

```text
+---------------------------+
| Admin Global              |
| Templates de Agentes      |  ← Você gerencia aqui
+---------------------------+
           |
           v
+---------------------------+
| Tabela: agent_templates   |
| (is_active = true)        |
+---------------------------+
           |
           v
+---------------------------+
| Cliente: Agentes de IA    |
| Aba "Templates"           |  ← Clientes veem aqui
+---------------------------+
```

---

## Diferença Entre as Duas Tabelas

| Tabela | Propósito | Quem Usa |
|--------|-----------|----------|
| `ai_template_base` | Configurações padrão para NOVAS empresas (departamentos, status, prompt inicial) | Sistema de provisioning |
| `agent_templates` | Templates prontos para clientes CLONAREM e criar agentes | Clientes na aba Templates |

---

## Resultado Esperado

1. Clientes verão **3 templates** na aba "Templates":
   - Agente de Atendimento (novo)
   - Agente de Agendamento (existente)
   
2. Cada template terá **etiquetas substituíveis** como:
   - `@empresa` - Nome da empresa
   - `@status [nome]` - Para alterar status
   - `@departamento [nome]` - Para alterar departamento
   - `@nome` - Nome do contato

3. Templates serão marcados como **destaque** para aparecerem no topo

---

## Segurança

- ✅ Sem alteração em código existente
- ✅ Apenas inserção de dados no banco
- ✅ Sem risco de regressão
- ✅ RLS da tabela `agent_templates` já está configurada (sem `law_firm_id`, é global)
