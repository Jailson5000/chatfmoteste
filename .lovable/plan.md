

# Atualizar Contagem de Conexoes e Landing Page

## 1. Contagem de Conexoes (Dashboard Global Admin)

### Problema
O hook `useSystemMetrics.tsx` conta apenas `current_instances` (da view `company_usage_summary`), que vem da tabela `whatsapp_instances` (Evolution API). Nao inclui conexoes da API Oficial (WhatsApp Cloud), Instagram e Facebook que estao na tabela `meta_connections`.

### Solucao
No arquivo `src/hooks/useSystemMetrics.tsx`:
- Adicionar uma query para contar registros ativos da tabela `meta_connections` (onde `is_active = true`)
- Somar ao `totalConnections` existente
- Tambem contar conexoes meta ativas para o `activeConnections` (meta_connections ativas sao sempre "conectadas")

Trecho afetado (apos linha 84):
```typescript
// Contar conexoes Meta (WhatsApp Cloud, Instagram, Facebook)
const { data: metaConnectionsData } = await supabase
  .from("meta_connections")
  .select("id, type, is_active");

const activeMetaConnections = metaConnectionsData?.filter(c => c.is_active).length || 0;

// Somar ao total
totalConnections += activeMetaConnections;
activeConnections += activeMetaConnections;
```

## 2. Atualizar Landing Page - Secao Multiplataforma

### Problema
A secao "Multiplataforma" (linhas 494-575) menciona apenas "WhatsApp e Site". Precisa incluir WhatsApp API Oficial, Instagram DM e Facebook Messenger.

### Solucao
No arquivo `src/pages/landing/LandingPage.tsx`:

**Titulo da secao** (linha 506-508): Mudar de "WhatsApp e Site" para "WhatsApp, Instagram, Facebook e Site"

**Grid de cards**: Expandir de 2 cards (WhatsApp + Chat Web) para 4 cards em layout responsivo:

1. **WhatsApp** (manter existente, atualizar texto):
   - Adicionar mencionamento da API Oficial
   - Destacar: "Compativel com WhatsApp Business API Oficial e conexao direta"
   - Features: Multiplos numeros, IA 24/7, Transcricao de audios, Leitura de imagens, API Oficial do WhatsApp

2. **Instagram DM** (novo card, cor roxa/gradient):
   - Icone Instagram
   - Texto: Receba e responda mensagens do Instagram Direct na mesma plataforma
   - Features: Respostas automaticas com IA, Resolucao de nome e foto do perfil, Historico unificado, Story mentions e replies

3. **Facebook Messenger** (novo card, cor azul):
   - Icone Facebook
   - Texto: Atenda mensagens do Messenger da sua pagina com IA ou atendente humano
   - Features: Integracao direta com sua pagina, IA respondendo automaticamente, Historico completo, Transferencia para humano

4. **Chat Web** (manter existente, sem alteracoes)

**Highlight** (linha 569-573): Atualizar texto para incluir todos os canais:
- "Conversas do WhatsApp, Instagram, Facebook e Chat Web aparecem no mesmo painel, com historico unificado e IA compartilhada."

### Imports adicionais
Importar icones do Lucide para Instagram e Facebook (usar `Instagram` se disponivel, senao `MessageSquare` e `Facebook`). Verificar se `lucide-react` tem esses icones, caso contrario usar icones customizados SVG inline.

## 3. Extracao de Perfil - WhatsApp Cloud API (Informativo)

A extracao de perfil ja esta **100% funcional**:
- O webhook extrai `value.contacts[].profile.name` do payload da WhatsApp Cloud API
- O nome e salvo no registro do cliente e no `contact_name` da conversa
- A cada nova mensagem, o nome e atualizado na conversa
- Quando o cliente nao tem nome no payload, usa o numero de telefone como fallback

Nenhuma mudanca necessaria aqui.

## Arquivos Modificados

| Arquivo | Mudanca |
|---|---|
| `src/hooks/useSystemMetrics.tsx` | Adicionar contagem de meta_connections |
| `src/pages/landing/LandingPage.tsx` | Expandir secao multiplataforma com Instagram e Facebook |

## Risco

Baixo. A contagem de conexoes e uma soma adicional. A landing page e apenas visual, sem impacto funcional.
