

# Sincronizar Planos: Corrigir features text para refletir os limites atualizados

## Diagnostico

Voce atualizou os limites numericos dos planos no painel admin, mas o texto das features (que aparece na landing page e em todo o sistema) ficou desatualizado. Abaixo as inconsistencias encontradas:

| Plano | Campo | Texto atual | Limite real |
|-------|-------|-------------|-------------|
| BASIC | Audio | "15 minutos de audio" | 20 minutos |
| BASIC | Agentes | Nao mencionado | 2 agentes |
| STARTER | Audio | "25 minutos de audio" | 30 minutos |
| STARTER | Agentes | "2 agentes de IA" | 3 agentes |
| PROFESSIONAL | Agentes | "4 agentes de IA" | 5 agentes |

Os planos **PRIME** e **ENTERPRISE** estao corretos (texto = limites).

## O que esta OK (nao precisa mudar)

- **Precos no Stripe**: Todos os 5 planos com price IDs corretos (mensal + anual)
- **Landing page**: Ja e 100% dinamica, busca planos do banco de dados
- **Pagina de registro**: Tambem dinamica, sem valores hardcoded
- **Edge Function de checkout**: Price IDs ja mapeados corretamente para todos os planos
- **billing-config.ts**: Precos de adicionais inalterados
- **MyPlanSettings**: Le diretamente do banco, sem valores fixos
- **useCompanyPlan**: Dinamico, sem problemas

## Solucao

Atualizar apenas o campo `features` (array de texto) dos 3 planos com inconsistencias no banco de dados. Como a landing page, registro e painel do cliente todos leem do banco, a correcao se propaga automaticamente.

### Updates no banco de dados

**BASIC** - Atualizar features para:
- "2 usuarios"
- "200 conversas com IA"
- "20 minutos de audio" (era 15)
- "1 WhatsApp conectado"
- "2 agentes de IA" (nao existia)
- "Automacao essencial"
- "Mensagens rapidas"
- "Respostas automaticas"

**STARTER** - Atualizar features para:
- "3 usuarios"
- "300 conversas com IA"
- "30 minutos de audio" (era 25)
- "2 WhatsApps conectados"
- "3 agentes de IA" (era 2)
- "Tudo do plano Basic"
- "Transcricao de audio e imagens"
- "Mensagens agendadas"

**PROFESSIONAL** - Atualizar features para:
- "4 usuarios"
- "400 conversas com IA"
- "40 minutos de audio"
- "4 WhatsApps conectados"
- "5 agentes de IA" (era 4)
- "Tudo do plano Starter"
- "IA avancada para conversacao"
- "Maior capacidade operacional"

## Impacto

- **Risco**: Zero - apenas atualizacao de texto descritivo
- **Arquivos modificados**: Nenhum - apenas dados no banco
- **Resultado**: Landing page, registro, painel do cliente e admin todos mostrarao os valores corretos automaticamente

