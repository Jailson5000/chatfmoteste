
# WhatsApp Cloud: Templates e Preparacao para App Review

## Resumo

Da imagem do Meta Developer Console, temos:
- Phone Number ID: `920102187863212`
- WABA ID: `1243984223971997`
- Numero de teste: `+1 555 159 0933`
- Destinatario de teste: `+55 63 98462 2450`

Para gravar os videos de demonstracao para liberar o WhatsApp no App Review, precisamos implementar o gerenciamento de templates (exigido para `whatsapp_business_management`) e garantir que o envio/recebimento funciona (para `whatsapp_business_messaging`).

---

## Mudancas

### 1. Migracao: Adicionar coluna `waba_id` na tabela `meta_connections`

A tabela nao tem `waba_id`. Sem ela, nao temos como chamar `GET /{waba_id}/message_templates`.

```sql
ALTER TABLE meta_connections ADD COLUMN waba_id TEXT;
```

### 2. Edge Function `meta-oauth-callback`: salvar `waba_id`

Nas funcoes `handleWhatsAppCloudEmbedded` e `handleWhatsAppCloud`, adicionar `waba_id` no upsert:

- **`handleWhatsAppCloudEmbedded`** (linha ~406): ja recebe `wabaId` como parametro, basta incluir no objeto de upsert
- **`handleWhatsAppCloud`** (linha ~318): ja tem `wabaId` na variavel local, basta incluir no upsert

### 3. Edge Function `meta-api`: adicionar acoes de templates

Adicionar 3 novas acoes antes do fluxo de envio de mensagens:

- **`list_templates`**: Recebe `connectionId`, busca `waba_id` da conexao, chama `GET /{waba_id}/message_templates?fields=name,status,category,language,components`
- **`create_template`**: Recebe `connectionId`, `name`, `category`, `language`, `components`, chama `POST /{waba_id}/message_templates`
- **`delete_template`**: Recebe `connectionId`, `templateName`, chama `DELETE /{waba_id}/message_templates?name={templateName}`

Todas as acoes validam autenticacao, tenant, e buscam o token descriptografado da conexao.

### 4. Componente `WhatsAppTemplatesManager.tsx`

Novo componente em `src/components/connections/WhatsAppTemplatesManager.tsx`:

- Recebe `connectionId` como prop
- Ao montar, chama `meta-api` com `action: "list_templates"` para listar templates
- Mostra tabela com: nome, status (badge colorido: verde=APPROVED, amarelo=PENDING, vermelho=REJECTED), categoria, idioma
- Botao "Novo Template" abre Dialog com campos:
  - Nome (snake_case, obrigatorio)
  - Categoria: MARKETING, UTILITY, AUTHENTICATION (Select)
  - Idioma: pt_BR (Select, com opcoes comuns)
  - Corpo da mensagem (Textarea)
- Botao deletar em cada template com `window.confirm`

### 5. Integrar no `WhatsAppCloudDetailPanel.tsx`

Adicionar secao "Templates de Mensagem" entre as configuracoes padrao e a zona de perigo, renderizando o componente `WhatsAppTemplatesManager` passando `connection.id`.

### 6. Deploy das edge functions

Redeployar `meta-api` e `meta-oauth-callback`.

---

## Detalhes Tecnicos

### Fluxo das novas acoes no `meta-api`

Para cada acao de template, o fluxo e:
1. Validar auth (Bearer token)
2. Buscar `law_firm_id` do usuario
3. Buscar conexao por `connectionId` + `law_firm_id` (seguranca multi-tenant)
4. Verificar que `waba_id` existe na conexao
5. Descriptografar `access_token`
6. Chamar Graph API com o `waba_id`
7. Retornar resultado

### Endpoints da Graph API para Templates

```text
Listar:  GET  https://graph.facebook.com/v21.0/{waba_id}/message_templates
         ?fields=name,status,category,language,components
         
Criar:   POST https://graph.facebook.com/v21.0/{waba_id}/message_templates
         Body: { name, category, language, components: [{ type: "BODY", text: "..." }] }
         
Deletar: DELETE https://graph.facebook.com/v21.0/{waba_id}/message_templates
         ?name={template_name}
```

### Estrutura do componente WhatsAppTemplatesManager

```text
+------------------------------------------+
| Templates de Mensagem    [+ Novo Template]|
+------------------------------------------+
| Nome       | Status    | Categoria | Acao |
| hello_world| APPROVED  | UTILITY   | [X]  |
| promo_jan  | PENDING   | MARKETING | [X]  |
+------------------------------------------+
```

O dialog de criacao tera campos basicos para permitir criar um template simples (apenas BODY text), que e suficiente para o video de demonstracao.

## Sequencia de Implementacao

1. Migracao SQL (adicionar `waba_id`)
2. Editar `meta-oauth-callback` (salvar `waba_id`)
3. Editar `meta-api` (acoes de templates)
4. Criar `WhatsAppTemplatesManager.tsx`
5. Editar `WhatsAppCloudDetailPanel.tsx` (integrar templates)
6. Deploy das edge functions

## Nota para o Video

Apos implementar:
1. Reconecte o WhatsApp Cloud (para salvar o `waba_id`)
2. Abra o painel de detalhes da conexao WhatsApp Cloud
3. Na secao "Templates", crie um template, liste, e delete - isso demonstra `whatsapp_business_management`
4. Envie/receba uma mensagem pela interface - isso demonstra `whatsapp_business_messaging`
