
## Ajustes na Landing Page

### 1. Remover SMS dos lembretes automaticos
**Arquivo:** `src/pages/landing/LandingPage.tsx` (linha 774)
- De: `"WhatsApp, e-mail e SMS"`
- Para: `"WhatsApp e e-mail"`

### 2. Diminuir fonte da frase "Unifique todos os seus canais..."
**Arquivo:** `src/pages/landing/LandingPage.tsx` (linha 611)
- De: `text-base md:text-lg`
- Para: `text-sm md:text-base`

Isso fara a frase caber em uma unica linha na maioria das telas.

### Detalhes tecnicos
Ambas as alteracoes sao em texto/classe CSS no mesmo arquivo. Nenhum risco de quebra.
