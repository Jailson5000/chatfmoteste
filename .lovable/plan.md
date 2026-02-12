
## Status Atual dos Secrets Meta

**Boas notícias:** Os secrets já estão configurados corretamente no projeto:
- ✅ **META_APP_ID** já existe como secret
- ✅ **META_APP_SECRET** já existe como secret

Os valores estão sendo acessados corretamente:
1. **No backend (Edge Functions)**: As funções `meta-oauth-callback` e `meta-api` acessam via `Deno.env.get("META_APP_ID")` e `Deno.env.get("META_APP_SECRET")`
2. **No frontend**: O arquivo `src/lib/meta-config.ts` usa `import.meta.env.VITE_META_APP_ID`, que contém o valor público (1447135433693990)

## O que falta fazer para que tudo funcione

### Problema identificado:
A página `/meta-test` mostra "Não conectado" para Instagram, Facebook e WhatsApp porque nenhuma integração foi conectada ainda. A página de teste está funcionando corretamente, mas depende de ter conexões salvas no banco de dados.

### Passos para preparar para o vídeo de App Review:

1. **Conectar Instagram** (via Configurações > Integrações)
   - Clique em "Conectar Instagram"
   - Faça login na sua conta Meta/Facebook
   - Selecione uma página com Instagram vinculada
   - Isto salva a conexão e permite testar `instagram_business_basic`, `instagram_business_manage_messages`, etc.

2. **Conectar Facebook** (via Configurações > Integrações)
   - Clique em "Conectar Facebook"
   - Faça login na sua conta Meta/Facebook
   - Selecione uma página do Facebook
   - Isto permite testar `pages_messaging` e `pages_manage_metadata`

3. **Conectar WhatsApp Cloud** (via Conexões)
   - Use o Embedded Signup wizard
   - Conecte ao seu WhatsApp Business Account
   - Isto permite testar `whatsapp_business_management` e `whatsapp_business_messaging`

4. **Testar cada permissão** em `/meta-test`
   - Cada botão "Testar" faz uma chamada real à Graph API da Meta
   - Os resultados aparecem na tela (perfeito para gravar o vídeo)
   - Se houver erro "Meta app not configured", significa que META_APP_SECRET não está recebido pela edge function

### Configuração necessária no Meta Developers (antes de gravar):

**Valid OAuth Redirect URIs:**
- Adicione: `https://chatfmoteste.lovable.app/auth/meta-callback`
- Adicione versão preview se necessário: `https://id-preview--39ee3e91-be33-4c6a-91f1-0c6513b5b19e.lovable.app/auth/meta-callback`

**Domínios permitidos para JavaScript SDK:**
- `chatfmoteste.lovable.app`
- `id-preview--39ee3e91-be33-4c6a-91f1-0c6513b5b19e.lovable.app` (preview)

## Verificação rápida: Os secrets estão funcionando?

Os secrets estão OK se:
- ✅ A página `/meta-test` carrega sem erros
- ✅ O App ID (1447135433693990) é exibido corretamente
- ⚠️ Os botões de teste aparecem desabilitados (esperado - sem conexões)
- ⚠️ Após conectar uma integração, os botões ficam habilitados

Se ao testar uma permissão você ver: "Meta app not configured" → isto significa que `META_APP_SECRET` não está sendo passado corretamente à edge function. Neste caso, verifique se o secret foi configurado e está visível na lista de secrets do projeto.

## Próximos passos recomendados:

1. Ir para **Configurações > Integrações**
2. Conectar Instagram (testa instagram_basic e instagram_manage_messages)
3. Conectar Facebook (testa pages_messaging e pages_manage_metadata)
4. Ir para **Conexões**
5. Conectar WhatsApp Cloud com Embedded Signup
6. Voltar para `/meta-test` e testar cada permissão
7. Gravar vídeo mostrando as respostas da Graph API

