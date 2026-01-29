

# Atualização: Informações Comerciais na Landing Page

## Dados Fornecidos

| Campo | Valor |
|-------|-------|
| Razão Social | MIAU - SOLUCOES DIGITAIS |
| CNPJ | 64.774.567/0001-06 |
| Endereço | COND PAULISTA CORPORATE CONJ 4 PAVMTO 15 SALA 1504 |

## Onde Aplicar

A landing page atualmente não exibe informações comerciais/jurídicas como CNPJ e razão social. Vou adicionar essas informações no **Footer** da página, que é o local padrão para dados empresariais.

## Mudanças no Arquivo

### `src/pages/landing/LandingPage.tsx`

Vou atualizar a seção do Footer (linhas 872-921) para incluir:

1. **Razão social e CNPJ** em texto discreto
2. **Endereço comercial** 
3. Manter toda a identidade visual "MiauChat" inalterada

### Layout Proposto

```text
┌─────────────────────────────────────────────────────────────┐
│                    Documentos Legais:                       │
│      🔒 Política de Privacidade    📋 Termos de Serviço    │
├─────────────────────────────────────────────────────────────┤
│  🐱 MIAUCHAT    |    Links legais    |    © 2026 MiauChat  │
├─────────────────────────────────────────────────────────────┤
│         MIAU - SOLUCOES DIGITAIS                            │
│         CNPJ: 64.774.567/0001-06                            │
│         COND PAULISTA CORPORATE CONJ 4 PAVMTO 15 SALA 1504  │
└─────────────────────────────────────────────────────────────┘
```

## Código a ser Modificado

Na seção do footer, adicionar uma nova `<div>` após o copyright:

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

## Observações

- **Nome do projeto permanece "MiauChat"** - sem alterações
- **Marca visual inalterada** - logo, cores e identidade mantidos
- Informações comerciais ficam em texto discreto (30% de opacidade)
- Padrão de mercado: razão social e CNPJ no rodapé

