
# Plano: Melhorar Área de Faturas e Demonstrativo PDF

## Problemas Identificados

### 1. Botão "Ver Faturas" redundante
Na imagem enviada pelo usuário, há dois botões que fazem coisas similares:
- **Ver Faturas** (linha 439-442): Abre diálogo com lista de faturas do Stripe
- **Gerenciar Assinatura** (linha 447-464): Abre o Stripe Customer Portal (que já inclui faturas)

O usuário quer remover "Ver Faturas" porque "Gerenciar Assinatura" já cobre essa funcionalidade.

### 2. Demonstrativo PDF muito básico
O PDF gerado pelo `invoiceGenerator.ts` está funcional, mas precisa de melhorias visuais:
- Adicionar logo real do MiauChat (base64)
- Usar cores da marca (vermelho/rosa #E11D48 ou similar)
- Incluir dados completos da empresa emissora (MiauChat)
- Melhorar formatação para parecer uma fatura profissional
- Incluir dados fiscais da empresa (CNPJ, endereço, etc.)

---

## Alterações Propostas

### 1. Frontend: `MyPlanSettings.tsx`

**Remover botão "Ver Faturas"** (linhas 439-442):
```tsx
// REMOVER:
<Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleOpenInvoices}>
  <FileText className="h-3 w-3" />
  Ver Faturas
</Button>
```

**Também remover/comentar o diálogo de faturas** (linhas 734-845) que não será mais usado, ou deixar para uso futuro pelo hook.

**Resultado: Mantém apenas 3 botões principais:**
1. "Demonstrativo" → Baixa PDF melhorado
2. "Gerenciar Assinatura" → Abre Stripe Portal (faturas, pagamentos, cupons)
3. "Solicitar Upgrade" → WhatsApp
4. "Contratar Adicionais" → Modal interno

### 2. Melhorar PDF do Demonstrativo: `invoiceGenerator.ts`

Transformar o PDF em um documento mais profissional com:

**Dados da empresa emissora (MiauChat):**
```
MiauChat - Sistema de Atendimento Inteligente
CNPJ: XX.XXX.XXX/0001-XX (pegar do sistema)
E-mail: suporte@miauchat.com.br
Site: www.miauchat.com.br
```

**Melhorias visuais:**
- Logo MiauChat no header (converter para base64)
- Cor primária da marca (#E11D48 - vermelho/rosa)
- Boxes com bordas arredondadas
- Separadores visuais claros
- Título "DEMONSTRATIVO DE FATURAMENTO"
- Nota clara: "Este documento é um demonstrativo. Para fins fiscais, utilize a Nota Fiscal."

**Estrutura atualizada do PDF:**

```text
+--------------------------------------------------+
|  [LOGO]  MiauChat                    DEMONSTRATIVO|
|          Sistema de Atendimento         DE        |
|          Inteligente                FATURAMENTO   |
+--------------------------------------------------+

+--------------------------------------------------+
| DADOS DO PRESTADOR DE SERVIÇO                    |
| MiauChat - Sistema de Atendimento Inteligente    |
| CNPJ: XX.XXX.XXX/0001-XX                         |
| E-mail: suporte@miauchat.com.br                  |
| www.miauchat.com.br                              |
+--------------------------------------------------+

+--------------------------------------------------+
| DADOS DA FATURA                                  |
| Número: DEM-12345678    |  Período: fevereiro 2026|
| Emissão: 04/02/2026     |  Vencimento: 06/03/2026 |
+--------------------------------------------------+

+--------------------------------------------------+
| CLIENTE                                          |
| Nome: Suporte MiauChat                           |
| CNPJ/CPF: 64.774.567/0001-06                     |
| E-mail: suporte@miauchat.com.br                  |
+--------------------------------------------------+

+--------------------------------------------------+
| DESCRIÇÃO                    |  QTD  |  VALOR    |
+--------------------------------------------------+
| Plano BASIC                  |   1   | R$ 197,00 |
| Agentes IA adicionais        |   1   | R$   0,00 |
+--------------------------------------------------+
|                              | TOTAL | R$ 197,00 |
+--------------------------------------------------+

+--------------------------------------------------+
| CONSUMO DO PERÍODO                               |
| Usuários: 2/2   WhatsApp: 1/1   Agentes: 1/2    |
| Conversas IA: 3/200    Áudio: 0/10 min          |
+--------------------------------------------------+

+--------------------------------------------------+
| * Este documento é apenas um demonstrativo de    |
|   consumo. Para fins fiscais, utilize a Nota     |
|   Fiscal Eletrônica (NFS-e) emitida mensalmente. |
+--------------------------------------------------+

MiauChat - Sistema de Atendimento Inteligente
Gerado em 04/02/2026 às 12:54:47
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/settings/MyPlanSettings.tsx` | Remover botão "Ver Faturas" e dialog associado |
| `src/lib/invoiceGenerator.ts` | Redesign completo do PDF com logo, cores e dados da empresa |

---

## Detalhes Técnicos

### Conversão da Logo para Base64

O jsPDF não suporta importar imagens via URL diretamente. A solução é:
1. Converter `miauchat-logo.png` para base64
2. Embutir no código como string
3. Usar `doc.addImage(base64Logo, 'PNG', x, y, width, height)`

### Cores da Marca

```typescript
// Cores MiauChat
const BRAND_COLORS = {
  primary: [225, 29, 72],    // #E11D48 - Rosa/Vermelho
  dark: [31, 41, 55],        // #1F2937 - Cinza escuro
  light: [248, 250, 252],    // #F8FAFC - Cinza claro
  white: [255, 255, 255],
};
```

### Dados da Empresa

```typescript
const COMPANY_INFO = {
  name: 'MiauChat',
  tagline: 'Sistema de Atendimento Inteligente',
  cnpj: 'XX.XXX.XXX/0001-XX', // Substituir pelo CNPJ real
  email: 'suporte@miauchat.com.br',
  website: 'www.miauchat.com.br',
  phone: '(63) 99954-0484',
};
```

---

## Fluxo Após Alterações

```text
ANTES:
[Ver Faturas] [Demonstrativo] [Gerenciar Assinatura] [Solicitar Upgrade] [+ Contratar Adicionais]

DEPOIS:
[Demonstrativo] [Gerenciar Assinatura] [Solicitar Upgrade] [+ Contratar Adicionais]
```

**Funcionalidades:**
- **Demonstrativo**: Baixa PDF bonito com dados da empresa e cliente
- **Gerenciar Assinatura**: Abre Stripe Portal onde pode ver faturas, pagar, usar cupons
- **Solicitar Upgrade**: Abre WhatsApp do suporte
- **Contratar Adicionais**: Modal interno para solicitar recursos extras

---

## Benefícios

1. **Interface mais limpa**: Remove botão redundante
2. **PDF profissional**: Demonstrativo com logo, cores e dados completos
3. **UX melhorada**: Cliente tem experiência consistente com a marca
4. **Sem regressão**: Funcionalidades de fatura continuam via Stripe Portal
5. **Documentação clara**: Diferencia "demonstrativo" de "nota fiscal"
