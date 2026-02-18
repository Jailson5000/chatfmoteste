
# Ajustes na Landing Page - Seção Multiplataforma

## Mudanças

### 1. WhatsApp Integrado - Trocar ícone Phone pelo ícone MessageCircle (logo do WhatsApp)

No card do WhatsApp (linha 522), o ícone principal é `Phone`. Trocar por `MessageCircle` que já é usado no canto superior direito do mesmo card e representa melhor o WhatsApp.

**Arquivo:** `src/pages/landing/LandingPage.tsx`
- Linha 522: Trocar `<Phone ...>` por `<MessageCircle ...>` (o ícone `MessageCircle` já está importado)
- Remover `Phone` dos imports (linha 24) se não for usado em outro lugar

### 2. Instagram Direct - Renomear para "Instagram" e remover feature

- Linha 549: Trocar título de "Instagram Direct" para "Instagram"
- Linha 556: Remover "Nome e foto do perfil" da lista de features (ficam 4 itens: Respostas automáticas com IA, Histórico unificado, Story mentions e replies, Transferência para humano)

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/landing/LandingPage.tsx` | Trocar ícone Phone por MessageCircle, renomear Instagram Direct, remover feature |
