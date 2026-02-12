
# Atualizar MetaTestPage para cobrir TODAS as permissoes exigidas pela Meta

## Contexto
A pagina de testes em `/meta-test` precisa ser atualizada para cobrir exatamente as permissoes que a Meta lista na secao "Testar os casos de uso". Atualmente ela cobre apenas um subconjunto e inclui testes que nao sao pedidos.

## Permissoes a testar (por caso de uso)

### Secao 1: Messenger (usa conexao Facebook)
| Permissao | Endpoint para teste |
|---|---|
| pages_utility_messaging | GET /{page_id}/conversations?limit=3 |
| pages_manage_metadata | GET /me/accounts?fields=id,name,category |
| public_profile | GET /me?fields=id,name |
| pages_messaging | GET /{page_id}/conversations?limit=3 |
| instagram_manage_messages | GET /{page_id}/conversations?platform=instagram&limit=3 |
| pages_show_list | GET /me/accounts?fields=id,name |
| instagram_basic | GET /{ig_account_id}?fields=id,username |
| business_management | GET /me/businesses?limit=3 |

### Secao 2: Instagram (usa conexao Instagram)
| Permissao | Endpoint para teste |
|---|---|
| instagram_business_manage_messages | GET /{ig_account_id}/conversations?platform=instagram&limit=3 |
| instagram_business_basic | GET /me?fields=id,name,username,profile_picture_url |
| public_profile | GET /me?fields=id,name |
| instagram_manage_comments | GET /{ig_account_id}/media?limit=3&fields=id,comments_count |
| instagram_manage_messages | GET /{page_id}/conversations?platform=instagram&limit=3 |
| pages_show_list | GET /me/accounts?fields=id,name |
| instagram_basic | GET /{ig_account_id}?fields=id,username |
| business_management | GET /me/businesses?limit=3 |

### Secao 3: WhatsApp (usa conexao WhatsApp Cloud)
| Permissao | Endpoint para teste |
|---|---|
| whatsapp_business_messaging | GET /{phone_id}?fields=verified_name,display_phone_number |
| public_profile | GET /me?fields=id,name |
| whatsapp_business_management | GET /{waba_id}/phone_numbers |
| business_management | GET /me/businesses?limit=3 |

## Mudancas

### Arquivo: `src/pages/admin/MetaTestPage.tsx`
- Reorganizar os cards para refletir os 3 casos de uso da Meta (Messenger, Instagram, WhatsApp)
- Adicionar botoes de teste para TODAS as permissoes listadas acima
- Remover testes que nao sao pedidos pela Meta (`instagram_business_content_publish`, `instagram_business_manage_insights`)
- Para permissoes que usam `page_id` ou `ig_account_id`, usar esses valores das conexoes salvas
- Adicionar um botao "Testar Todos" em cada secao para rodar todos os testes de uma vez (facilita gravacao do video)
- Mostrar indicadores visuais claros de obrigatorio vs opcional (como a Meta mostra)

### Arquivo: `supabase/functions/meta-api/index.ts`
- Nenhuma mudanca necessaria. A acao `test_api` ja faz proxy de qualquer endpoint da Graph API.

## Resultado
A pagina `/meta-test` vai espelhar exatamente os 3 casos de uso do painel Meta. Voce podera clicar "Testar Todos" em cada secao, ver todos ficarem verdes, e gravar o video mostrando que cada permissao funciona.
