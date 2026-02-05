

# Plano de Correção: Destaque do Preço PRIME e Alinhamento do BASIC

## Problemas Identificados

### 1. Preço do PRIME sem destaque
- O preço R$ 97,90 precisa de um destaque visual para chamar atenção
- Sugestão: adicionar uma borda ou background especial ao redor do preço

### 2. Desalinhamento no BASIC
- A descrição do BASIC é mais longa que os outros planos
- O `min-h-[40px]` na descrição não é suficiente para acomodar textos maiores
- Isso empurra o preço para baixo, desalinhando com os outros cards

---

## Solução Proposta

### Correção 1: Destaque no Preço do PRIME
Adicionar lógica condicional para aplicar um estilo especial ao preço do plano PRIME:

```typescript
// Linha 117-135: Adicionar flag isPrime
const isPrime = plan.name.toUpperCase() === "PRIME";
return {
  ...
  isPrime,
};

// Linha 717-724: Adicionar classe especial ao container do preço
<div className={`mt-3 mb-3 ${plan.isPrime ? "bg-red-500/20 rounded-lg px-2 py-1 inline-block border border-red-500/40" : ""}`}>
```

### Correção 2: Aumentar altura mínima da descrição
Aumentar o `min-h` da descrição de `40px` para `56px` (ou mais) para garantir que todas as descrições caibam sem empurrar o preço:

```typescript
// Linha 713: Aumentar min-height
<p className="text-xs text-white/40 mt-1 min-h-[56px]">
```

---

## Arquivos a Modificar

- `src/pages/landing/LandingPage.tsx`
  - Linha 117-135: Adicionar flag `isPrime` ao objeto do plano
  - Linha 713: Aumentar `min-h-[40px]` para `min-h-[56px]`
  - Linha 717-724: Adicionar container com destaque para o preço do PRIME

---

## Resultado Esperado

- PRIME terá o preço R$ 97,90 destacado com fundo vermelho translúcido e borda
- Todos os cards terão os preços alinhados na mesma altura
- O texto mais longo do BASIC não causará mais desalinhamento

