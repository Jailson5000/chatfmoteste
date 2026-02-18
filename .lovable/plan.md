
# Analise Completa: Captura de Eventos - WhatsApp, Instagram e Facebook

## Status Atual: Permissoes Aprovadas vs Codigo

Todas as permissoes do App Meta foram aprovadas. Vamos comparar com o que o codigo solicita e processa.

## 1. WhatsApp Cloud (API Oficial)

**Status: OK - Funcionando**

- Conexao via Embedded Signup - nao depende de escopos OAuth
- Webhook processa: `text`, `image`, `audio`, `video`, `document`, `sticker`, `button`, `interactive` (list_reply, button_reply)
- Delivery statuses (`delivered`, `read`, `failed`) sao rastreados
- Media e baixada e armazenada no Storage
- Permissoes `whatsapp_business_messaging` e `whatsapp_business_management` sao concedidas automaticamente pelo Embedded Signup

**Nenhuma mudanca necessaria.**

## 2. Instagram

**Status: Funcional, mas com melhoria possivel nos escopos OAuth**

Escopos atuais solicitados no OAuth:
```
pages_show_list, instagram_basic, instagram_manage_messages
```

A Meta aprovou tambem os NOVOS escopos:
```
instagram_business_basic, instagram_business_manage_messages
```

Os escopos novos (`instagram_business_*`) sao a versao atualizada dos antigos. Adiciona-los garante compatibilidade futura, pois a Meta pode deprecar os antigos.

**Webhook subscription** atual: `messages, messaging_postbacks, messaging_optins` -- correto para Instagram DM.

**Mudanca necessaria:**
- Adicionar `instagram_business_basic,instagram_business_manage_messages` aos escopos OAuth do Instagram

## 3. Facebook Messenger

**Status: Funcional, com uma melhoria util**

Escopos atuais:
```
pages_messaging, pages_manage_metadata, pages_show_list
```

Permissao aprovada mas NAO solicitada:
- `pages_read_engagement` -- permite ler comentarios e engajamento da pagina
- `business_management` -- util para fluxos que acessam WABA via OAuth legado

**Webhook subscription** atual: `messages, messaging_postbacks, messaging_optins` -- correto para Messenger.

**Mudanca necessaria:**
- Adicionar `pages_read_engagement` aos escopos OAuth do Facebook (permite futuras funcionalidades de engajamento)
- Adicionar `business_management` aos escopos do Facebook (util para descoberta de WABA no fluxo legado)

## Resumo das Mudancas

Apenas **1 arquivo** precisa ser alterado:

### Arquivo: `src/lib/meta-config.ts`

Atualizar os escopos OAuth para incluir todas as permissoes aprovadas:

```
META_SCOPES = {
  instagram: "pages_show_list,instagram_basic,instagram_manage_messages,instagram_business_basic,instagram_business_manage_messages",
  facebook: "pages_messaging,pages_manage_metadata,pages_show_list,pages_read_engagement,business_management",
}
```

Isso garante que:
- Tokens gerados pelo OAuth tenham TODAS as permissoes aprovadas
- Compatibilidade futura com deprecacao dos escopos antigos do Instagram
- Acesso a dados de engajamento do Facebook quando necessario

## O Que JA Esta Correto (nao mexer)

| Componente | Status |
|---|---|
| Webhook verificacao (GET) | OK |
| Webhook Instagram DM | OK |
| Webhook Facebook Messenger | OK |
| Webhook WhatsApp Cloud | OK |
| Delivery statuses (WABA) | OK |
| Download de midia (WABA) | OK |
| Attachments Instagram/Facebook | OK |
| Story mentions e replies | OK |
| Button e interactive messages | OK |
| Criacao de clientes e conversas | OK |
| Resolucao de nomes via Graph API | OK |
| Subscription de paginas no OAuth | OK |
| Embedded Signup (WhatsApp) | OK |

## Risco

Risco ZERO. Adicionar escopos extras no OAuth nao quebra nada -- o usuario simplesmente vera mais permissoes na tela de autorizacao. Conexoes existentes continuam funcionando com os tokens atuais. Apenas NOVAS conexoes usarao os escopos ampliados.
