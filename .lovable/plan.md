

# Atualizar Limites de Conexoes WhatsApp dos Planos

## Situacao Atual (banco de dados)

| Plano | max_instances atual |
|---|---|
| PRIME | 1 |
| BASIC | 2 |
| STARTER | 3 |
| PROFESSIONAL | 4 |
| ENTERPRISE | 6 |

## Novos Valores Solicitados

| Plano | max_instances novo |
|---|---|
| PRIME | 1 (sem alteracao) |
| BASIC | **3** |
| STARTER | **5** |
| PROFESSIONAL | **6** |
| ENTERPRISE | **10** |

## Escopo da Mudanca

Todos os locais que exibem limites de planos (landing page, aba "Meu Plano" do cliente, aba "Planos" do admin global, edge function de pagamento) ja leem os valores diretamente do banco de dados. Portanto, a unica acao necessaria e:

**Uma migracao SQL** atualizando `max_instances` na tabela `plans` para os 4 planos afetados:

```sql
UPDATE plans SET max_instances = 3 WHERE name = 'BASIC';
UPDATE plans SET max_instances = 5 WHERE name = 'STARTER';
UPDATE plans SET max_instances = 6 WHERE name = 'PROFESSIONAL';
UPDATE plans SET max_instances = 10 WHERE name = 'ENTERPRISE';
```

Nenhum arquivo de codigo precisa ser alterado — tudo e dinamico a partir do banco.

## Arquivos Afetados

Nenhum arquivo de codigo. Apenas migracao no banco de dados.

