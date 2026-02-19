

## Reduzir espacos entre descricao e precos nos cards de planos

### Problema
Ha muito espaco vazio entre a descricao do plano e a linha de preco. Isso e causado por dois fatores:
1. A descricao tem `min-h-[72px]` - reserva espaco demais quando o texto e curto
2. O bloco de preco tem `min-h-[80px]` - reserva espaco excessivo para o texto promocional

### Solucao

**Arquivo:** `src/pages/landing/LandingPage.tsx`

1. **Reduzir min-h da descricao** de `72px` para `48px` (linha 909) - ainda mantendo alinhamento entre cards mas com menos espaco desperdicado
2. **Reduzir min-h do bloco de preco** de `80px` para `56px` (linha 913) - suficiente para acomodar o texto promocional sem espaco extra
3. **Reduzir mb do bloco de preco** de `mb-3` para `mb-1` (linha 913) - menos espaco abaixo dos precos tambem

Resultado: os cards ficarao mais compactos, com os precos mais proximos da descricao.
