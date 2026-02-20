
## Melhorias na Tela de Empresas (Global Admin)

### O que existe hoje

A tabela "Aprovadas" em `/global-admin/companies` já mostra:
- Nome/email da empresa
- Subdomínio com link
- Plano + valor/mês
- Status (Ativo, Trial, Suspensa…)
- Faturamento: badge do Stripe (Em dia, Vencido, Trial, Cancelada) com tooltip mostrando último pagamento e próximo vencimento
- Provisionamento, Email de Acesso, Usuários/Conexões, Data de criação
- Ações no menu dropdown (Editar, Cobrança, Suspender…)

### O que falta ou está difícil de ver

| Informação | Situação atual |
|---|---|
| Data de criação da empresa | Só aparece como coluna de texto `dd/mm/aaaa`, sem destaque |
| Histórico de trial (início + fim + tipo) | Só aparece no tooltip do badge de status se tiver trial ativo |
| Data da última fatura paga | Só no tooltip do badge de Faturamento (escondido) |
| Próxima fatura | Só no tooltip do badge de Faturamento (escondido) |
| Status da assinatura de forma clara | Badge pequeno com nome abreviado, difícil de escanear |
| Histórico de faturas | Não existe na UI |
| Tempo de vida do cliente | Não existe (quantos meses/dias desde criação) |

### Solução proposta

Sem criar novas telas ou edge functions, reorganizar e enriquecer as informações visíveis diretamente na tabela e no tooltip expandido da coluna "Faturamento".

#### 1. Coluna "Faturamento" — Reescrita completa

Transformar o badge simples em um bloco informativo compacto com 3 linhas visíveis:
```
[badge: Em dia / Vencido / Sem assinatura]
Último pgto: 15/01/2026
Próx. venc:  15/02/2026
```
O tooltip vai continuar existindo com informações adicionais do Stripe (valor, ID).

#### 2. Coluna "Criada em" — Adicionar tempo de vida

Mostrar:
```
15/01/2025
há 13 meses
```
Usando `formatDistanceToNow` do `date-fns`, já instalado no projeto.

#### 3. Coluna "Status" — Mostrar trial com datas completas no tooltip

O trial badge já existe, mas o tooltip mostra as datas somente em hover. Adicionar na própria célula, quando em trial, o texto com data de fim:
```
[Ativa]
[Trial até 20/02/2026]
```

#### 4. Nova seção "Faturamento Detalhado" no dropdown de ações

No menu de ações (⋯) de cada empresa, adicionar item "Ver Faturas" que abre um `Sheet` lateral com:
- Resumo da assinatura (status, valor, ciclo)
- Data de criação da empresa + tempo como cliente
- Histórico de trial (início, fim, tipo)
- Botão "Gerar Cobrança Stripe" (já existe como DropdownMenuItem)
- Botão "Abrir Portal Stripe" (link externo para o painel)

O Sheet vai buscar os dados já presentes em `company.subscription` — sem nova chamada de API.

### Detalhes Técnicos

**Arquivo modificado:** `src/pages/global-admin/GlobalAdminCompanies.tsx`

- **Coluna "Faturamento"** (linhas ~1440–1531): substituir o `{(() => {...})()}` por um componente inline `BillingCell` que mostra badge + 2 linhas de data visíveis.

- **Coluna "Criada em"** (linha ~1700): adicionar `formatDistanceToNow(new Date(company.created_at), { locale: ptBR, addSuffix: true })` abaixo da data.

- **Coluna "Status"** (linhas ~1390–1438): manter como está, o badge de trial já funciona bem.

- **Sheet lateral "Detalhe de Faturamento"**: novo estado `billingDetailCompany`, renderizado como `<Sheet>` no final do componente, usando dados já disponíveis em `company.subscription` e `company.trial_*`.

- **Menu de ações** (linhas ~1702–1760): adicionar item "Ver Detalhe Financeiro" que seta `billingDetailCompany`.

### Importações necessárias

```typescript
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
```

Ambas já disponíveis no projeto (`date-fns` instalado, `Sheet` em `@/components/ui/sheet`).

### Risco e Impacto

| Item | Risco |
|---|---|
| Reescrever coluna Faturamento | Baixo — só muda apresentação visual, dados são os mesmos |
| Adicionar distância temporal | Muito baixo — `formatDistanceToNow` é função pura |
| Sheet de detalhe | Baixo — usa dados já carregados, sem nova query |

Nenhuma alteração em banco de dados, edge functions ou lógica de negócio.

### Resultado esperado

Ao abrir a aba "Aprovadas", você verá de relance, por empresa, sem precisar fazer hover:
- **Quando foi criada** e há quanto tempo é cliente
- **Status da assinatura** com data do próximo vencimento visível
- **Data do último pagamento** confirmado
- No menu de ações → "Ver Detalhe Financeiro" → Sheet com histórico completo de trial e assinatura
