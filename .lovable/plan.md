
# Plano de Correção: Layout dos Cards de Planos

## Problemas Identificados

### 1. PRIME - Destaque apenas no preço
- Atualmente o destaque está só no preço (bg-red-500/20)
- Precisa aplicar o destaque no card inteiro, similar ao PROFESSIONAL

### 2. PROFESSIONAL - Badge "Mais Escolhido" tapando o nome
- O badge está com `top: -2.5` que está muito próximo do nome
- Precisa subir mais o badge para não sobrepor o texto "PROFESSIONAL"

### 3. BASIC - Preço desalinhado
- A descrição do BASIC é muito longa: "Ideal para pequenos negócios ou profissionais que querem iniciar a automação de atendimentos com IA de forma simples e acessível."
- O `min-h-[56px]` não é suficiente para textos tão longos
- **Solução**: Diminuir o texto da descrição do BASIC no banco de dados ou aumentar a altura mínima

---

## Solução Proposta

### Correção 1: Destaque do Card PRIME (como o PROFESSIONAL)
Adicionar lógica para aplicar estilo especial ao card inteiro do PRIME:

```typescript
// Linha 702-706: Adicionar condição isPrime ao className do card
className={`relative p-4 rounded-2xl border transition-all duration-300 flex flex-col ${
  plan.popular
    ? "border-red-500/40 bg-gradient-to-b from-red-500/10 to-transparent shadow-xl shadow-red-500/5"
    : plan.isPrime
      ? "border-red-500/40 bg-gradient-to-b from-red-500/10 to-transparent shadow-xl shadow-red-500/5"
      : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
}`}
```

E remover o destaque apenas do preço (linha 719):
```typescript
// Voltar para o padrão sem destaque específico no preço
<div className="mt-3 mb-3">
```

### Correção 2: Subir o Badge "Mais Escolhido"
Mudar de `-top-2.5` para `-top-4` para afastar mais do nome:

```typescript
// Linha 709: Aumentar distância do topo
<div className="absolute -top-4 left-1/2 -translate-x-1/2 ...">
```

### Correção 3: Alinhar Preços
Aumentar altura mínima da descrição para acomodar textos maiores:

```typescript
// Linha 715: Aumentar min-height de 56px para 72px
<p className="text-xs text-white/40 mt-1 min-h-[72px]">
```

---

## Arquivos a Modificar

- `src/pages/landing/LandingPage.tsx`
  - Linhas 702-706: Adicionar condição `plan.isPrime` ao estilo do card
  - Linha 709: Mudar `-top-2.5` para `-top-4`
  - Linha 715: Aumentar `min-h-[56px]` para `min-h-[72px]`
  - Linha 719: Remover destaque específico do preço (já está no card)

---

## Resultado Esperado

- PRIME terá o card inteiro com borda vermelha e gradiente (igual ao PROFESSIONAL)
- Badge "Mais Escolhido" ficará acima do nome PROFESSIONAL sem sobrepor
- Todos os preços estarão alinhados independente do tamanho da descrição
