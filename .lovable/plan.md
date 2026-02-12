

# Plano: Media Download WhatsApp Cloud + Icones Visuais + Coexistencia de Conexoes

## Resumo

Este plano cobre 3 frentes: (1) download de midias do WhatsApp Cloud API no meta-webhook, (2) icones visuais diferenciados para Instagram/Facebook/WhatsApp Cloud em conversas e kanban, e (3) coexistencia do WhatsApp normal (Evolution API) com WhatsApp Cloud (API Oficial) na pagina de Conexoes, incluindo botao "+" com opcao de escolha.

---

## Parte 1 -- Download de Midias do WhatsApp Cloud API

Atualmente o `meta-webhook` recebe mensagens de midia (imagem, audio, video, documento) mas **nao faz download** -- salva `media_url = null` e apenas o placeholder como conteudo.

### O que sera feito:

1. **No `meta-webhook/index.ts`**, na funcao `processWhatsAppCloudEntry`:
   - Quando `msg.type` for `image`, `audio`, `video`, `document` ou `sticker`, extrair o `media_id` (ex: `msg.image.id`)
   - Buscar o token de acesso da `meta_connections` (decriptografar com `decryptToken`)
   - Fazer GET para `https://graph.facebook.com/v21.0/{media_id}` com header `Authorization: Bearer {token}` para obter a URL temporaria do arquivo
   - Fazer GET na URL retornada para baixar os bytes do arquivo
   - Fazer upload do arquivo para o Supabase Storage (bucket `chat-media`, path: `{law_firm_id}/{conversation_id}/{msg.id}.{ext}`)
   - Salvar a URL publica do Storage no campo `media_url` da mensagem

2. **Criar bucket `chat-media`** (se nao existir) via migracao SQL com politica RLS para leitura por membros do tenant

### Fluxo tecnico:

```text
WhatsApp Cloud --> meta-webhook (POST)
  |
  +--> msg.image.id = "123456"
  +--> GET graph.facebook.com/v21.0/123456 (com Bearer token)
  +--> Retorna { url: "https://lookaside.fbsbx.com/..." }
  +--> GET https://lookaside.fbsbx.com/... (download binario)
  +--> Upload para Supabase Storage: chat-media/{law_firm_id}/...
  +--> Salva media_url com URL publica do Storage
```

---

## Parte 2 -- Icones Visuais Diferenciados

### 2.1 ConversationSidebarCard (lista de conversas)

Na funcao `getConnectionInfo`, ao inves de usar icone generico `Phone` ou `Smartphone` para Instagram/Facebook/WhatsApp Cloud, usar icones especificos:

| Origin | Icone | Cor | Label |
|--------|-------|-----|-------|
| INSTAGRAM | `Instagram` (lucide) | Gradiente rosa/roxo | "Instagram" |
| FACEBOOK | `Facebook` (lucide) | Azul #1877F2 | "Facebook" |
| WHATSAPP_CLOUD | `MessageCircle` ou icone WhatsApp SVG | Verde #25D366 | Ultimos 4 digitos |
| WhatsApp normal (Evolution) | `Phone` (lucide) | Verde padrao | Ultimos 4 digitos |
| Widget/Site | `Globe` (lucide) | Azul (ja funciona) | "Site" |

Os icones `Instagram` e `Facebook` ja estao importados no arquivo mas nao sao usados no render.

### 2.2 KanbanCard

Mesma logica na funcao `getConnectionInfo` do `KanbanCard.tsx`, diferenciando os icones por origin.

---

## Parte 3 -- Coexistencia WhatsApp Normal + API Oficial na Pagina de Conexoes

### 3.1 Botao "Nova Conexao" com escolha de tipo

Substituir o botao `Nova Conexao` por um `DropdownMenu` com 2 opcoes:
- **WhatsApp (QR Code)** -- fluxo atual via Evolution API
- **WhatsApp Cloud (API Oficial)** -- novo fluxo via Meta Graph API (cria registro na `meta_connections` com type `whatsapp_cloud`)

### 3.2 Linhas do WhatsApp Cloud na tabela de Conexoes

Alem das instancias Evolution (WhatsApp normal) e do Chat Web, listar as `meta_connections` de tipo `whatsapp_cloud` na mesma tabela com:
- Icone verde diferenciado com badge "API OFICIAL"
- Status de conexao (baseado em `is_active` e presenca de `access_token`)
- Configuracoes padrao (departamento, status, responsavel) -- ja existem na tabela `meta_connections`
- Menu de acoes: Ativar/Desativar, Ver detalhes, Excluir

### 3.3 Painel de detalhes do WhatsApp Cloud

Ao clicar na linha do WhatsApp Cloud, abrir um `Sheet` similar ao Chat Web com:
- Nome da pagina/conta (page_name)
- phone_number_id
- Status (Ativo/Inativo)
- Configuracoes padrao (departamento, status, tipo de atendimento, agente IA ou humano)

### 3.4 Dialog de criacao do WhatsApp Cloud

Um formulario simples para o usuario preencher:
- Nome da conexao (display)
- Phone Number ID (do painel Meta Developers > WhatsApp > API Setup)
- Access Token (sera criptografado e salvo na `meta_connections`)
- Opcoes de departamento/status/responsavel padrao

### 3.5 Exibicao de Instagram e Facebook (futuro)

As conexoes de Instagram e Facebook ja podem ser listadas nessa mesma tabela tambem, com icones proprios (gradiente rosa para Instagram, azul para Facebook). Por ora, so as que ja existem via OAuth continuam gerenciadas em Settings > Integracoes.

---

## Secao Tecnica

### Arquivos que serao modificados:

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/meta-webhook/index.ts` | Adicionar download de midia via Graph API + upload para Storage |
| `src/components/conversations/ConversationSidebarCard.tsx` | Icones diferenciados por origin (Instagram, Facebook, WhatsApp Cloud) |
| `src/components/kanban/KanbanCard.tsx` | Icones diferenciados por origin |
| `src/pages/Connections.tsx` | Botao dropdown "Nova Conexao", listar meta_connections tipo whatsapp_cloud, painel de detalhes |
| `src/components/connections/NewInstanceDialog.tsx` | Renomear para "Nova Conexao WhatsApp (QR Code)" |

### Novos arquivos:

| Arquivo | Proposito |
|---------|-----------|
| `src/components/connections/NewWhatsAppCloudDialog.tsx` | Dialog para criar conexao WhatsApp Cloud API |
| `src/components/connections/WhatsAppCloudDetailPanel.tsx` | Sheet de detalhes da conexao WhatsApp Cloud |
| Migracao SQL | Criar bucket `chat-media` com RLS |

### Dependencias:

- Nenhuma nova dependencia npm necessaria
- Os icones `Instagram`, `Facebook`, `MessageCircle` ja existem no lucide-react

### Ordem de implementacao:

1. Migracao SQL (bucket chat-media)
2. meta-webhook (download de midias)
3. Icones visuais (ConversationSidebarCard + KanbanCard)
4. Pagina de Conexoes (dropdown + listagem + detalhes do WhatsApp Cloud)

