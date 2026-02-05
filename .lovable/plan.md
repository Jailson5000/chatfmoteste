
# Plano de Correção: Layout de Preços da Landing Page

## Problemas Identificados

### 1. Cards de Planos Desalinhados
- Existem 5 planos (PRIME, BASIC, STARTER, PROFESSIONAL, ENTERPRISE)
- Grid atual é `lg:grid-cols-4` - não comporta 5 cards alinhados
- ENTERPRISE está "caindo" para linha de baixo

### 2. Preço do PRIME mostrando "98" em vez de "97,90"
- Função `formatPrice` (linha 102-104) usa `maximumFractionDigits: 0`
- Isso arredonda R$ 97,90 → R$ 98
- Precisa mostrar centavos quando existirem

### 3. Seção "Consumo Adicional" Desalinhada
- Grid é `lg:grid-cols-4` mas são 5 itens
- O 5º item (Agente de IA adicional) cai para nova linha

---

## Solução Proposta

### Correção 1: Grid de 5 Colunas para os Planos
```typescript
// Linha 692: Mudar de grid-cols-4 para grid-cols-5
<div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
```
- Diminuir `gap-4` para `gap-3` para economizar espaço
- Reduzir padding interno dos cards de `p-6` para `p-4`

### Correção 2: Formatação de Preço com Decimais
```typescript
// Linha 102-104: Atualizar formatPrice
const formatPrice = (price: number): string => {
  // Se o preço tem centavos, mostrar com 2 casas decimais
  const hasDecimals = price % 1 !== 0;
  return price.toLocaleString("pt-BR", { 
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0 
  });
};
```
- R$ 97,90 → "97,90" (mostra centavos)
- R$ 197,00 → "197" (sem centavos)
- R$ 1.297,00 → "1.297" (sem centavos)

### Correção 3: Grid de 5 Colunas para Consumo Adicional
```typescript
// Linha 759: Mudar para grid-cols-5
<div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
```
- Acomodar os 5 itens em uma única linha

---

## Ajustes de Estilo nos Cards

Para os cards caberem em 5 colunas:

| Propriedade | Antes | Depois |
|-------------|-------|--------|
| Gap do grid | `gap-4` | `gap-3` |
| Padding dos cards | `p-6` | `p-4` |
| Tamanho do preço | `text-3xl` | `text-2xl` |
| Descrição min-height | `min-h-[32px]` | `min-h-[40px]` |

---

## Arquivos a Modificar

- `src/pages/landing/LandingPage.tsx`
  - Linha 102-104: Função `formatPrice`
  - Linha 692: Grid dos planos
  - Linha 696: Padding dos cards
  - Linha 718: Tamanho do preço
  - Linha 759: Grid do consumo adicional

---

## Resultado Esperado

- 5 cards de planos alinhados na mesma linha em desktop
- Preço do PRIME: "97,90" (correto)
- 5 itens de consumo adicional alinhados na mesma linha
