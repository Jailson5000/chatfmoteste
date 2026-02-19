

## Melhorias na Landing Page do MiauChat

### 1. Navegacao no Header (Inspirado na imagem de referencia)

Adicionar links de navegacao no header entre o logo e o botao "Comecar", similar ao exemplo da ClinicaExperts:
- **Recursos** (scroll para secao de features)
- **Planos** (scroll para secao #planos)
- **Demonstracao** (scroll para secao do video)
- **FAQ** (scroll para secao #faq)
- Botao **Entrar** (link para /auth)
- Botao **Testar gratis** (destaque, link para /register)

No mobile, esses links ficarao em um menu hamburger.

### 2. Atualizar Conversas por IA nos Planos

Atualizar os limites de conversas com IA no banco de dados:

| Plano | Atual | Novo |
|-------|-------|------|
| PRIME | 150 | **200** |
| BASIC | 200 | **300** |
| STARTER | 300 | **350** |
| PROFESSIONAL | 400 | **450** |
| ENTERPRISE | 1000 | mantido |

### 3. Melhorar Descricoes dos Planos (features no banco)

Atualizar as features/descricoes de cada plano para destacar o nivel de IA:

- **PRIME**: Manter como "IA essencial", 200 conversas
- **BASIC**: Destacar "IA inteligente" com 300 conversas
- **STARTER**: Destacar "IA avancada" com 350 conversas
- **PROFESSIONAL**: Destacar "IA avancada de alta performance" com 450 conversas
- **ENTERPRISE**: Manter "IA ilimitada sob demanda"

Cada plano tera descricoes mais claras e atrativas, incluindo mencion da API Oficial do WhatsApp inclusa.

### 4. WhatsApp com Logo Real e API Oficial Inclusa

- Usar o icone SVG oficial do WhatsApp (verde, reconhecivel) no card de integracao, em vez do icone generico do Lucide
- Adicionar destaque visual (badge/banner) nos planos indicando: "API Oficial do WhatsApp inclusa" com icone do WhatsApp real (similar a imagem de referencia da Meta)
- Adicionar na secao de integracao a informacao sobre custos da API oficial: "Notificacoes via API Oficial da Meta (mensagens entre R$ 0,08 e R$ 0,40)" com o estilo da imagem enviada

### 5. Descricao dos Planos na Landing Page

Melhorar o texto `description` de cada plano no DB para ser mais atrativo:
- **PRIME**: "Para profissionais solo que querem automatizar o basico"
- **BASIC**: "Para pequenas equipes com IA inteligente"
- **STARTER**: "Para equipes em crescimento com IA avancada"
- **PROFESSIONAL**: "Para operacoes robustas com IA de alta performance"
- **ENTERPRISE**: "Para grandes operacoes com modelo flexivel"

---

### Detalhes Tecnicos

**Arquivos modificados:**
1. `src/pages/landing/LandingPage.tsx` - Header com navegacao, icone SVG do WhatsApp, badge de API oficial, menu mobile
2. Migracao SQL - Atualizar `plans` table: `max_ai_conversations`, `features` e `description`

**Migracao SQL:**
```sql
UPDATE plans SET 
  max_ai_conversations = 200,
  description = 'Para profissionais solo que querem automatizar o atendimento',
  features = '["1 usuario","200 conversas com IA","10 minutos de audio","1 WhatsApp conectado","1 agente de IA","API Oficial do WhatsApp inclusa","Automacao essencial","Ideal para profissionais solo"]'::jsonb
WHERE name = 'PRIME';

UPDATE plans SET 
  max_ai_conversations = 300,
  description = 'Para pequenas equipes com IA inteligente',
  features = '["2 usuarios","300 conversas com IA inteligente","20 minutos de audio","1 WhatsApp conectado","2 agentes de IA","API Oficial do WhatsApp inclusa","Mensagens rapidas","Respostas automaticas"]'::jsonb
WHERE name = 'BASIC';

-- (similar para STARTER, PROFESSIONAL, ENTERPRISE)
```

**Header responsivo:**
- Desktop: links inline + botoes "Entrar" e "Testar gratis"
- Mobile: menu hamburger com todos os links

**Icone WhatsApp:**
- SVG inline do logo oficial do WhatsApp (verde #25D366) em vez de `MessageCircle` do Lucide
- Badge nos cards de plano: "API Oficial inclusa"

