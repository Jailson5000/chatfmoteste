
## Corrigir textos de WhatsApp nos planos BASIC e STARTER

### Problema
O banco de dados ja tem `max_instances` correto (BASIC=2, STARTER=3), mas o campo `features` (array de textos exibido na Landing Page) ainda mostra os valores antigos:
- **BASIC**: "1 WhatsApp conectado" (deveria ser "2 WhatsApps conectados")
- **STARTER**: "2 WhatsApps conectados" (deveria ser "3 WhatsApps conectados")

Alem disso, o formulario de criacao de plano no Global Admin tem valor padrao hardcoded de `max_instances: 1`.

### Alteracoes necessarias

**1. Atualizar textos no banco de dados (SQL)**

Substituir as strings no array `features` da tabela `plans`:

```text
BASIC:   "1 WhatsApp conectado"    ->  "2 WhatsApps conectados"
STARTER: "2 WhatsApps conectados"  ->  "3 WhatsApps conectados"
```

**2. Atualizar defaults no GlobalAdminPlans.tsx**

Arquivo: `src/pages/global-admin/GlobalAdminPlans.tsx`
- Linha 32: `max_instances: 1` -> `max_instances: 2`
- Linha 84: `max_instances: 1` -> `max_instances: 2`

Isso garante que ao criar um novo plano pelo painel, o valor padrao de conexoes WhatsApp ja venha como 2 (compativel com o BASIC atualizado).

### Resultado esperado
- Landing Page exibira "2 WhatsApps conectados" no BASIC e "3 WhatsApps conectados" no STARTER
- Global Admin refletira os valores corretos em todos os locais (ja dinamico via banco)
- Nenhuma outra alteracao de codigo necessaria, pois a LP e o admin ja renderizam features e max_instances direto do banco
