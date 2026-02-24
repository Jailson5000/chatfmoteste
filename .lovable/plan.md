
# Corrigir Conexao WhatsApp: Token, Limite e UI

## Problemas Identificados

### 1. Erro 401 - Token uazapi invalido
O token salvo em `system_settings` (`uazapi_admin_token`) esta sendo rejeitado pelo servidor uazapi (`https://miauchat.uazapi.com`). 

**Acao necessaria:** Voce precisa atualizar o token no painel de administracao global (Configuracoes > uazapi). Verifique no painel do uazapi qual e o token correto da instancia/servidor.

### 2. Erro "Maximo de conexao" - View company_usage_summary vazia
A view `company_usage_summary` retorna vazio para o tenant "Escritorio de Suporte MiauChat". Isso faz o `check_company_limit` falhar e bloquear a criacao mesmo com apenas 1 instancia de 4 permitidas.

**Correcao no codigo:** Tornar o `checkLimit` mais resiliente -- se a view retornar erro ou vazio, permitir a acao (fail-open) em vez de bloquear.

### 3. Badge "UAZAPI"/"EVO" visivel ao cliente
Os badges tecnicos de provedor aparecem na lista de conexoes. O cliente nao precisa saber qual provedor esta sendo usado.

**Correcao no codigo:** Remover os badges de provedor de ambos os componentes que exibem a lista.

### 4. Mensagem de erro tecnica
O erro "uazapi connect failed (401): {...}" e exibido diretamente ao cliente. Deve ser traduzido para algo amigavel.

## Alteracoes no Codigo

### Arquivo: `src/hooks/useWhatsAppInstances.tsx`
- No `createInstance.mutationFn`: Se o `checkLimit` retornar erro (sem dados), permitir a criacao em vez de bloquear
- No `createInstance.onError`: Traduzir mensagens de erro tecnicas (ex: "uazapi connect failed (401)") para mensagens amigaveis como "Erro de autenticacao com o servidor. Contate o suporte."

### Arquivo: `src/pages/Connections.tsx`
- Remover qualquer referencia visual ao provedor (nao ha badges neste componente atualmente, confirmar)

### Arquivo: `src/components/connections/WhatsAppInstanceList.tsx`
- Linhas 142-146: Remover os badges "UAZAPI" e "EVO" da coluna Nome

### Arquivo: `src/components/connections/ConnectionDetailPanel.tsx`
- Verificar e remover qualquer mencao ao provedor visivel ao cliente

## Acao Manual Necessaria (por voce)
Apos a implementacao, atualize o token uazapi em:
- Painel Admin Global > Configuracoes > campo "Token Admin uazapi"
- Verifique no painel do uazapi (`https://miauchat.uazapi.com`) qual e o token correto
