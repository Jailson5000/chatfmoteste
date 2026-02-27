

# Plano: Reload do Schema Cache + Teste do Export

## Passo 1 — Executar SQL
Rodar o comando `NOTIFY pgrst, 'reload schema'` via migration para forçar o PostgREST a reconhecer todas as tabelas importadas.

## Passo 2 — Verificar tabelas
Após o reload, testar a Edge Function `export-database` com action `list` para confirmar que todas as tabelas aparecem corretamente.

## Arquivos
Nenhum arquivo precisa ser alterado — apenas execução de SQL e teste.

