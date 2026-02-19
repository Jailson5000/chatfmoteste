

## Corrigir alinhamento dos precos e reduzir espaco superior

### Problema
Os precos estao desalinhados porque:
1. O texto promocional (BASIC: "De R$ 297 por", ENTERPRISE: "A partir de R$ 1.697") cria alturas diferentes entre os cards
2. O "R$", valor e "/mes" estao como spans soltos misturados com divs, sem uma linha de preco bem definida
3. O `min-h-[60px]` nao e suficiente para acomodar o texto promocional mais alto
4. O `mt-3` adiciona espaco desnecessario acima do bloco de precos

### Solucao

**Arquivo:** `src/pages/landing/LandingPage.tsx`

**Reestruturar o bloco de precos (linhas 913-929):**
- Aumentar `min-h` de `60px` para `80px` para acomodar qualquer texto promocional
- Reduzir `mt-3` para `mt-1` para diminuir o espaco acima dos precos
- Envolver "R$ {price} / mes" em uma div propria com `flex items-baseline` para que o preco fique sempre numa linha consistente
- Mover o texto promocional (tanto BASIC quanto ENTERPRISE) para uma div separada acima da linha de preco
- Usar `justify-end` no container flex-col para que a linha do preco fique sempre alinhada na base

**Estrutura final do bloco:**
```text
+----------------------------------+
| [texto promo, se existir]        |  <- parte superior (altura variavel)
|                                  |
| R$ 197  / mes                    |  <- parte inferior (sempre alinhada)
+----------------------------------+
```

Todos os 5 cards terao o mesmo `min-h`, com o preco sempre posicionado na base do bloco, garantindo alinhamento horizontal perfeito.
