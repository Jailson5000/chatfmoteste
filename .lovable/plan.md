

# Teste WhatsApp Cloud API com Numero de Teste da Meta

## O que a Meta oferece para testes

A Meta fornece um **numero de teste** (`+1 555 159 0933`) com:
- **phone_number_id**: `920102187863212`
- **WABA ID**: `1243984223971997`
- **Token temporario**: gerado na pagina "Configuracao da API"
- **Template pre-aprovado**: `hello_world` (en_US)

Esse numero permite enviar mensagens para numeros cadastrados em "Ate" (seu numero `+55 63 98462 2450` ja esta la).

## Plano

### 1. Adicionar secao "Teste WhatsApp Cloud" na MetaTestPage

**Arquivo:** `src/pages/admin/MetaTestPage.tsx`

Adicionar uma secao completa com 3 funcionalidades:

**1.1 - Conexao Manual de Teste**
- Campos para: Token temporario (do painel Meta), Phone Number ID, WABA ID
- Valores pre-preenchidos com os dados do screenshot (`920102187863212`, `1243984223971997`)
- Botao "Salvar Conexao de Teste" que chama o backend para criar/atualizar a `meta_connection` com esses dados
- Isso cria uma conexao valida no banco sem precisar do fluxo OAuth/Embedded Signup

**1.2 - Envio de Mensagem de Teste**
- Campo "Numero destino" (pre-preenchido: `5563984622450`)
- Campo "Mensagem" (pre-preenchido: "Mensagem de teste do MiauChat")
- Botao "Enviar Template hello_world" - envia o template pre-aprovado da Meta (obrigatorio para primeira mensagem)
- Botao "Enviar Texto Livre" - envia mensagem de texto (so funciona dentro da janela de 24h apos o destinatario responder)
- Exibe resultado detalhado (message_id ou erro)

**1.3 - Criacao de Template (para video do App Review)**
- Ja existe no `WhatsAppTemplatesManager.tsx` - vamos integrar ele na MetaTestPage tambem
- Mostra lista de templates e permite criar/excluir

### 2. Adicionar action `send_test_message` no backend

**Arquivo:** `supabase/functions/meta-api/index.ts`

Nova action que:
- Recebe `connectionId`, `recipientPhone`, `message`, e `useTemplate` (boolean)
- Se `useTemplate=true`: envia o template `hello_world` (necessario para primeira mensagem, pois o numero de teste nao tem conversa aberta)
- Se `useTemplate=false`: envia texto livre (funciona depois que o destinatario respondeu, abrindo janela de 24h)
- Valida autenticacao e tenant
- Busca a conexao, descriptografa token
- Chama `POST /{phone_number_id}/messages` na Graph API
- Retorna resultado (message_id ou erro detalhado)
- **Nao cria conversa no banco** - e puramente para teste/demonstracao

### 3. Adicionar action `save_test_connection` no backend

**Arquivo:** `supabase/functions/meta-api/index.ts`

Nova action que:
- Recebe `accessToken`, `phoneNumberId`, `wabaId`
- Valida autenticacao e tenant
- Criptografa o token
- Faz upsert na tabela `meta_connections` com type `whatsapp_cloud`
- Retorna o ID da conexao criada

## Fluxo para o video do App Review

### Video 1: whatsapp_business_messaging
1. Abrir `/meta-test`
2. Colar o token temporario do painel da Meta
3. Clicar "Salvar Conexao de Teste" (mostra sucesso)
4. Digitar o numero destino e clicar "Enviar Template hello_world"
5. Mostrar o celular recebendo a mensagem
6. Responder pelo celular
7. Mostrar a mensagem chegando na tela de Conversas (via webhook)

### Video 2: whatsapp_business_management
1. Na mesma pagina `/meta-test`, rolar ate Templates
2. Clicar "Novo Template"
3. Preencher nome, categoria, corpo da mensagem
4. Clicar "Criar" - mostrar sucesso
5. Mostrar o template na lista

## Resumo das alteracoes

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/MetaTestPage.tsx` | Secao de conexao manual, envio de teste e integracao do gerenciador de templates |
| `supabase/functions/meta-api/index.ts` | Actions `send_test_message` e `save_test_connection` |

## Sobre o webhook de recebimento

O webhook `meta-webhook` ja esta pronto para receber mensagens do WhatsApp Cloud. Quando alguem responder para o numero de teste, a mensagem sera processada automaticamente **desde que**:
1. A conexao de teste esteja salva no banco com `page_id = 920102187863212`
2. O webhook esteja configurado no painel da Meta (Etapa 3 do screenshot)

Para o video, basta ter o webhook configurado apontando para:
`https://jiragtersejnarxruqyd.supabase.co/functions/v1/meta-webhook`

