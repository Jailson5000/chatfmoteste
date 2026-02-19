

## Alinhar precos dos planos na Landing Page

### Problema
Os precos estao desalinhados porque BASIC e ENTERPRISE tem texto promocional extra acima do preco (ex: "De R$ 297 por" e "A partir de R$ 1.697"), enquanto PRIME, STARTER e PROFESSIONAL nao tem, fazendo os valores ficarem em alturas diferentes.

### Solucao
Dar a todos os cards de plano uma altura fixa/minima para a area de preco, de modo que o valor principal fique sempre na mesma posicao vertical, independente de ter ou nao texto promocional acima.

---

### Detalhes Tecnicos

**Arquivo:** `src/pages/landing/LandingPage.tsx`

**Alteracao no bloco de preco (linhas 913-929):**
- Adicionar `min-h-[60px] flex flex-col justify-end` no container `div.mt-3.mb-3` para que todos os blocos de preco tenham a mesma altura minima
- O texto promocional (quando existir) ficara acima, e o preco principal sempre alinhado na parte inferior do bloco
- Isso garante alinhamento horizontal dos precos entre todos os cards sem alterar o layout visual existente

