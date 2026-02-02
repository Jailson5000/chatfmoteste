

# Plano: Remover Endereço do Rodapé

## Localização do Problema

O endereço está no rodapé da Landing Page em:

**Arquivo:** `src/pages/landing/LandingPage.tsx`  
**Linhas:** 901-903

```tsx
<p className="text-xs text-white/20 mt-1">
  COND PAULISTA CORPORATE CONJ 4 PAVMTO 15 SALA 1504
</p>
```

---

## Solução

Remover o parágrafo que contém o endereço, mantendo apenas:
- Nome da empresa (MIAU - SOLUCOES DIGITAIS)
- CNPJ (64.774.567/0001-06)

---

## Alteração

**Antes (linhas 893-904):**
```tsx
{/* Informações Comerciais */}
<div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
  <p className="text-xs text-white/30">
    MIAU - SOLUCOES DIGITAIS
  </p>
  <p className="text-xs text-white/25 mt-1">
    CNPJ: 64.774.567/0001-06
  </p>
  <p className="text-xs text-white/20 mt-1">
    COND PAULISTA CORPORATE CONJ 4 PAVMTO 15 SALA 1504
  </p>
</div>
```

**Depois:**
```tsx
{/* Informações Comerciais */}
<div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
  <p className="text-xs text-white/30">
    MIAU - SOLUCOES DIGITAIS
  </p>
  <p className="text-xs text-white/25 mt-1">
    CNPJ: 64.774.567/0001-06
  </p>
</div>
```

---

## Resultado

O rodapé exibirá apenas:
- **Logo + MIAUCHAT**
- **Links legais** (Política de Privacidade, Termos de Serviço)
- **Copyright**
- **Nome da empresa** (MIAU - SOLUCOES DIGITAIS)
- **CNPJ** (64.774.567/0001-06)

Sem o endereço físico.

