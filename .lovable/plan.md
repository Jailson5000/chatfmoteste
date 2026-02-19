

## Destaques visuais nos planos da Landing Page

### 1. Badge "Comece aqui" no plano BASIC
Adicionar um badge similar ao "Mais Escolhido" do PROFESSIONAL, mas com o texto "Comece aqui" no plano BASIC. O card do BASIC tambem recebera o estilo destacado (borda vermelha e gradiente).

### 2. Preco promocional no BASIC
Exibir acima do preco R$ 197 o valor R$ 297 riscado (line-through), dando a impressao de desconto/promocao.

### 3. Preco promocional no ENTERPRISE
Exibir acima do preco R$ 1.297 o valor R$ 1.697 riscado, mesmo estilo promocional.

---

### Detalhes Tecnicos

**Arquivo modificado:** `src/pages/landing/LandingPage.tsx`

**Alteracoes no mapeamento dos planos (useMemo):**
- Adicionar propriedade `isBasic` para identificar o plano BASIC
- Adicionar propriedade `originalPrice` com o valor "riscado" (297 para BASIC, 1.697 para ENTERPRISE)

**Alteracoes no card de plano:**
- Renderizar badge "Comece aqui" quando `isBasic === true` (estilo similar ao "Mais Escolhido" mas com cor/texto diferente)
- Aplicar destaque visual (borda vermelha) tambem no card BASIC
- Antes do preco atual, renderizar o `originalPrice` em texto pequeno com `line-through` e opacidade reduzida

**Nenhuma alteracao no banco de dados** - tudo e visual no frontend.
