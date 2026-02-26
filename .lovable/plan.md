

# Plano: Script de Export do Banco via Edge Function

## Abordagem

Criar uma **Edge Function** (`export-database`) que usa a `service_role` key para bypasses RLS e exporta todas as 90 tabelas em JSON. Acessível apenas por Global Admins.

Adicionalmente, criar uma **página no painel Global Admin** com botão de download que gera um `.zip` contendo um arquivo JSON por tabela.

## Implementação

### 1. Edge Function `export-database`

- Recebe lista de tabelas (ou "all") via POST
- Valida que o chamador é Global Admin (`is_admin()`)
- Para cada tabela, faz `SELECT *` paginado (1000 rows por batch) usando service role
- Tabelas grandes (`messages`, `messages_archive`, `audit_logs`, `webhook_logs`) são exportadas em chunks
- Retorna JSON com todas as tabelas ou streaming por tabela
- Limite de segurança: timeout de 120s, exporta tabela por tabela via múltiplas chamadas

### 2. Página Global Admin: "Export Database"

- Nova rota `/global-admin/export` 
- Lista todas as tabelas com contagem de registros
- Botão "Exportar Tudo" que chama a edge function tabela por tabela
- Progresso visual (barra de progresso)
- Gera ZIP final com JSZip (já instalado) contendo `{tabela}.json` por tabela
- Botão para download do ZIP

### Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/export-database/index.ts` | Nova edge function |
| `src/pages/global-admin/GlobalAdminExport.tsx` | Nova página |
| `src/App.tsx` | Adicionar rota |
| `src/components/layout/GlobalAdminLayout.tsx` | Adicionar link no menu |

### Segurança
- Apenas Global Admins podem acessar
- Validação via `is_admin(auth.uid())` na edge function
- Service role key usada apenas server-side

