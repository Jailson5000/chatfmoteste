

# Plano: Preparar Instagram, Facebook e WhatsApp Cloud para Gravacao do Video Meta App Review

## Resumo

Existem ajustes necessarios no codigo e na configuracao para que os tres canais (Instagram DM, Facebook Messenger e WhatsApp Cloud API) funcionem em modo teste e possam ser demonstrados no video para aprovacao da Meta.

## Problemas Identificados

1. **VITE_META_APP_ID nao esta disponivel no frontend** - O App ID da Meta esta configurado apenas como secret do backend (`META_APP_ID`), mas os componentes Instagram e Facebook usam `import.meta.env.VITE_META_APP_ID`, que nao existe no `.env`
2. **Permissoes do Instagram desatualizadas** - O codigo usa permissoes antigas (`instagram_basic`, `instagram_manage_messages`). A Meta migrou para `instagram_business_basic`, `instagram_business_manage_messages`
3. **Falta pagina de teste interna** - Nao existe uma pagina para testar chamadas individuais a cada permissao (listar paginas, enviar mensagem, buscar WABA)
4. **VITE_META_CONFIG_ID nao configurado** - Necessario para o Embedded Signup do WhatsApp Cloud

## Etapas de Implementacao

### 1. Configurar VITE_META_APP_ID no frontend

Como o App ID da Meta e um identificador publico (nao e segredo), ele pode ser adicionado diretamente no codigo. Vamos criar uma constante compartilhada que os tres componentes usam, obtendo o valor do `META_APP_ID` ja configurado como secret.

- Criar `src/lib/meta-config.ts` com o App ID exportado
- Atualizar `InstagramIntegration.tsx`, `FacebookIntegration.tsx` e `NewWhatsAppCloudDialog.tsx` para usar essa constante

### 2. Atualizar permissoes do Instagram para a nova API

Alterar o escopo OAuth do Instagram de:
- `instagram_basic, instagram_manage_messages` (deprecated)

Para:
- `instagram_business_basic, instagram_business_manage_messages` (nova API)

Arquivo: `src/components/settings/integrations/InstagramIntegration.tsx`

### 3. Criar pagina /admin/meta-test

Criar uma pagina de teste interna acessivel em `/admin/meta-test` com botoes para:

- **instagram_business_basic**: `GET /me?fields=id,name,username` - Mostra dados da conta conectada
- **instagram_business_manage_messages**: Enviar mensagem teste via conversa existente
- **pages_messaging**: Enviar mensagem teste via Messenger
- **pages_manage_metadata**: `GET /me/accounts` - Listar paginas gerenciadas
- **whatsapp_business_management**: `GET /{waba_id}/phone_numbers` - Listar numeros do WABA
- **whatsapp_business_messaging**: Enviar mensagem teste via WhatsApp Cloud

Cada botao executa a chamada, mostra o resultado (JSON) e o status (sucesso/erro) na tela - perfeito para gravar o video de demonstracao.

### 4. Adicionar rota no App.tsx

Registrar a nova pagina `/admin/meta-test` no roteador, protegida para administradores.

## Detalhes Tecnicos

### Arquivos a criar:
- `src/lib/meta-config.ts` - Constantes Meta compartilhadas
- `src/pages/admin/MetaTestPage.tsx` - Pagina de teste das permissoes

### Arquivos a modificar:
- `src/components/settings/integrations/InstagramIntegration.tsx` - Atualizar permissoes OAuth
- `src/components/settings/integrations/FacebookIntegration.tsx` - Usar meta-config
- `src/components/connections/NewWhatsAppCloudDialog.tsx` - Usar meta-config
- `src/App.tsx` - Adicionar rota /admin/meta-test

### Configuracao necessaria (pelo usuario):
- Definir `VITE_META_APP_ID` com o valor do App ID da Meta (1447135433693990 conforme screenshot)
- Definir `VITE_META_CONFIG_ID` quando a Meta aprovar a conta (para WhatsApp Embedded Signup)
- Configurar o webhook URL no Meta Dashboard apontando para a edge function `meta-webhook`
- Adicionar os redirect URIs corretos no Meta Dashboard

## Fluxo de Gravacao do Video

Apos a implementacao, o roteiro de gravacao sera:

1. Abrir `/admin/meta-test`
2. Clicar em cada botao de permissao, mostrando a resposta da API
3. Navegar para Configuracoes > Integracoes e conectar Instagram e Facebook
4. Navegar para Conexoes e conectar WhatsApp Cloud
5. Ir para Conversas e demonstrar envio/recebimento de mensagens nos tres canais

