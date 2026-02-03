

# Plano: Melhorar Visibilidade do "Fora do Expediente"

## Problema Identificado

No tema claro (light mode), as linhas diagonais que indicam "Fora do Expediente" usam `hsl(var(--muted)/0.4)` que resulta em um cinza muito claro, quase branco, tornando praticamente invisível contra o fundo branco.

**Evidência no código:**
```tsx
// Linha 203 - células fora do expediente
bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,hsl(var(--muted)/0.4)_5px,hsl(var(--muted)/0.4)_10px)]

// Linha 499 - legenda
bg-[repeating-linear-gradient(135deg,hsl(var(--muted)),hsl(var(--muted))_2px,transparent_2px,transparent_5px)]
```

---

## Solução Proposta

Trocar a cor do padrão listrado de `muted` (cinza) para um **azul claro suave** que:
- É visível tanto no tema claro quanto escuro
- Transmite visualmente a ideia de "bloqueado/indisponível"
- Não compete visualmente com as cores de status dos agendamentos

**Cor escolhida:** `hsl(210 50% 70% / 0.3)` - azul claro com transparência

---

## Mudanças Necessárias

### Arquivo: `AgendaProCalendar.tsx`

| Linha | Atual | Novo |
|-------|-------|------|
| 191 | `!isWorkingHour && "bg-muted/40"` | `!isWorkingHour && "bg-blue-100/30 dark:bg-blue-900/20"` |
| 197 | `!isWorkingHour && "bg-muted/50"` | `!isWorkingHour && "bg-blue-100/40 dark:bg-blue-900/30"` |
| 203 | `hsl(var(--muted)/0.4)` | `hsl(210 70% 70% / 0.25)` para claro, ajuste para escuro |
| 499 | `hsl(var(--muted))` na legenda | Mesma cor azul clara |

---

## Visualização Comparativa

| Tema | Antes | Depois |
|------|-------|--------|
| **Claro** | Linhas brancas invisíveis | Linhas azul-claras visíveis |
| **Escuro** | Linhas cinza sutis | Linhas azul-escuras sutis |

---

## Código Final

```tsx
// Linha 191 - Background base do slot
!isWorkingHour && "bg-blue-100/40 dark:bg-blue-950/30"

// Linha 197 - Background da coluna de hora
!isWorkingHour && "bg-blue-100/50 dark:bg-blue-950/40"

// Linha 203 - Padrão listrado das células
!isWorkingHour && "bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(147_197_253/0.4)_5px,rgb(147_197_253/0.4)_10px)] dark:bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(30_64_175/0.3)_5px,rgb(30_64_175/0.3)_10px)]"

// Linha 499 - Legenda
bg-[repeating-linear-gradient(135deg,rgb(147_197_253/0.6),rgb(147_197_253/0.6)_2px,transparent_2px,transparent_5px)] dark:bg-[repeating-linear-gradient(135deg,rgb(30_64_175/0.5),rgb(30_64_175/0.5)_2px,transparent_2px,transparent_5px)]
```

---

## Benefícios

1. **Visibilidade**: Claramente visível em ambos os temas
2. **Consistência**: Mesma cor na grade e na legenda
3. **Profissionalismo**: Azul claro é uma cor padrão para indicar "indisponível" em calendários
4. **Zero Regressão**: Não afeta nenhuma outra funcionalidade do calendário

---

## Arquivos Modificados

| Arquivo | Linhas Alteradas |
|---------|------------------|
| `src/components/agenda-pro/AgendaProCalendar.tsx` | 191, 197, 203, 499 |

