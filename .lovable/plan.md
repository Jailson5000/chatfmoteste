

## Ajustes visuais nos badges e precos promocionais

### 1. Centralizar badges "Comece aqui" e "Mais Escolhido"
Os badges ja estao com `left-1/2 -translate-x-1/2`, mas podem nao estar centralizados visualmente por causa do padding do card. Ajustar para garantir centralizacao perfeita.

### 2. Formato de preco promocional no BASIC
Alterar o layout do preco do BASIC para exibir:
- Linha 1: "De R$ 297 por" (texto pequeno, 297 riscado)
- Linha 2: "R$ 197 / mes" (preco grande)

### 3. Manter formato do ENTERPRISE
O ENTERPRISE ja mostra "A partir de R$ 1.697" riscado - manter esse estilo.

---

### Detalhes Tecnicos

**Arquivo modificado:** `src/pages/landing/LandingPage.tsx`

**Alteracao no bloco de preco (linhas ~913-924):**
- Para planos com `originalPrice` (BASIC): renderizar "De R$ 297 por" com o 297 em `line-through`, seguido do preco atual na linha abaixo
- Centralizar os badges ajustando `text-center` no container dos badges

**Alteracao nos badges (linhas ~897-906):**
- Verificar que ambos os badges (`Mais Escolhido` e `Comece aqui`) estejam com `text-center` e centralizados corretamente no card

