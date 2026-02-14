
# Corrigir Envio/Recebimento do Instagram e Nomes de Contatos

## Problemas identificados

### 1. Instagram nao recebe mensagens (webhook)
A conexao Instagram salva no banco tem `ig_account_id: NULL`. Quando o webhook recebe uma mensagem do Instagram, ele busca a conexao por `ig_account_id = 17841479677897649` e nao encontra nada. O log confirma: `"No active connection for instagram recipient: 178414796778..."`.

### 2. Instagram nao envia mensagens
O erro retornado pela Meta e: **"O app nao tem acesso avancado a permissao instagram_manage_messages e o usuario destinatario nao tem funcao no app"** (erro #200, subcodigo 2534048). Isso significa que o app Meta esta em **Modo de Desenvolvimento** e so pode enviar mensagens para usuarios cadastrados como testadores no app.

**Solucao (no painel da Meta, nao no codigo):**
1. Acesse [developers.facebook.com](https://developers.facebook.com) > Seu App
2. Va em **App Review > Permissions and Features**
3. Solicite **Advanced Access** para `instagram_manage_messages`
4. OU, para testes imediatos: va em **App Roles > Roles** e adicione o Instagram do destinatario como **Tester**

### 3. Nomes de contatos nao capturados (Facebook e Instagram)
O webhook busca o nome/foto do perfil via Graph API apenas ao criar um cliente novo. Se o perfil nao retorna dados (por falta de permissao ou erro silencioso), o nome generico permanece. Alem disso, clientes ja existentes nunca tem o nome atualizado.

## Alteracoes tecnicas

### 1. Corrigir dados da conexao Instagram (migracao SQL)
Atualizar a conexao Instagram existente para preencher o `ig_account_id` correto (`17841479677897649`), que ja esta salvo na conexao Facebook. Isso corrige o webhook imediatamente.

### 2. Backend: `supabase/functions/meta-webhook/index.ts`

**Melhorar lookup de conexao Instagram:**
- Adicionar fallback: se a busca por `ig_account_id` nao encontrar conexao, tentar buscar pela coluna `page_id` usando o `entry.id` (que e o IG Account ID do dono da pagina)
- Isso garante que mesmo conexoes antigas (sem `ig_account_id` preenchido) ainda funcionem

**Melhorar resolucao de nomes (Facebook e Instagram):**
- Para clientes **ja existentes** que tem nome generico (ex: "FACEBOOK 2589", "INSTAGRAM 5644"), buscar o nome real via Graph API e atualizar
- Atualizar tambem o `contact_name` na conversa quando o nome real for encontrado
- Tratar erros de Graph API de forma mais explicita (logar o motivo da falha)

### 3. Backend: `supabase/functions/meta-api/index.ts`

**Melhorar lookup de conexao para envio Instagram:**
- Na busca fallback por `type`, adicionar tambem busca por `source: 'oauth'` para evitar pegar conexoes de teste manual
- Logar detalhes da conexao encontrada para facilitar debug

### 4. Deploy
- Redeployer `meta-webhook` e `meta-api`

## Resumo de acoes

| Acao | Tipo | Resolve |
|------|------|---------|
| Atualizar `ig_account_id` na conexao Instagram | Migracao SQL | Recebimento de mensagens |
| Fallback no lookup do webhook | Codigo | Robustez para conexoes antigas |
| Atualizar nomes de clientes existentes | Codigo | Nomes genericos no Facebook e Instagram |
| Solicitar Advanced Access no painel Meta | Manual (usuario) | Envio de mensagens Instagram |

## O que NAO muda
- Fluxo de conexao/integracao (conforme solicitado)
- Fluxo do Facebook (ja funciona)
- Fluxo do WhatsApp Cloud
