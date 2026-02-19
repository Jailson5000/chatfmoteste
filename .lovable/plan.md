

## Adicionar integrações Facebook e Instagram nos planos

### O que será feito
Atualizar as features de **todos os 5 planos** no banco de dados para incluir menções às integrações com Facebook e Instagram, além de melhorar as descrições do PRIME e BASIC.

### Alterações por plano

**PRIME** - Adicionar:
- "Integração Facebook e Instagram"

**BASIC** - Adicionar:
- "Integração Facebook e Instagram"

**STARTER** - Adicionar:
- "Integração Facebook e Instagram"

**PROFESSIONAL** - Adicionar:
- "Integração Facebook e Instagram"

**ENTERPRISE** - Adicionar:
- "Integração Facebook e Instagram"

### Implementação
Uma única migração SQL atualizará o campo `features` (array) de cada plano na tabela `plans`, adicionando a linha "Integração Facebook e Instagram" à lista existente de cada plano. Nenhuma alteração de código frontend é necessária, pois os cards já renderizam dinamicamente as features do banco.
