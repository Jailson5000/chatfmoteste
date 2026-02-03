
# Plano: Trocar Cor do "Fora do Expediente" para Branco/Vermelho

## Situação Atual

O padrão listrado de "Fora do Expediente" usa cores azuis:
- **Light mode**: `rgb(147_197_253)` (azul claro)
- **Dark mode**: `rgb(30_64_175)` (azul escuro)

## Nova Paleta

Trocar para branco com vermelho, combinando com as cores primárias do sistema (`--primary: 0 72% 51%` = vermelho).

| Elemento | Cor Atual | Nova Cor |
|----------|-----------|----------|
| Listras (light) | Azul claro `rgb(147_197_253)` | Vermelho claro `rgb(252_165_165)` (red-300) |
| Listras (dark) | Azul escuro `rgb(30_64_175)` | Vermelho escuro `rgb(153_27_27)` (red-800) |
| Background base (light) | `bg-blue-100/40` | `bg-red-50/40` |
| Background base (dark) | `bg-blue-950/30` | `bg-red-950/30` |
| Borda da legenda | `border-blue-300/800` | `border-red-300/800` |

## Mudanças no Código

### Arquivo: `AgendaProCalendar.tsx`

**Linha 191** - Background base do slot:
```tsx
// De:
!isWorkingHour && "bg-blue-100/40 dark:bg-blue-950/30"
// Para:
!isWorkingHour && "bg-red-50/40 dark:bg-red-950/30"
```

**Linha 197** - Background da coluna de hora:
```tsx
// De:
!isWorkingHour && "bg-blue-100/50 dark:bg-blue-950/40"
// Para:
!isWorkingHour && "bg-red-50/50 dark:bg-red-950/40"
```

**Linha 203** - Padrão listrado diagonal:
```tsx
// De:
bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(147_197_253/0.4)_5px,rgb(147_197_253/0.4)_10px)] dark:bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(30_64_175/0.3)_5px,rgb(30_64_175/0.3)_10px)]
// Para:
bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(252_165_165/0.5)_5px,rgb(252_165_165/0.5)_10px)] dark:bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(153_27_27/0.4)_5px,rgb(153_27_27/0.4)_10px)]
```

**Linha 499** - Ícone da legenda:
```tsx
// De:
border-blue-300 dark:border-blue-800 bg-[repeating-linear-gradient(135deg,rgb(147_197_253/0.6),...)]
// Para:
border-red-300 dark:border-red-800 bg-[repeating-linear-gradient(135deg,rgb(252_165_165/0.7),...)]
```

## Resultado Visual

| Tema | Aparência |
|------|-----------|
| **Claro** | Fundo branco rosado com listras vermelhas suaves |
| **Escuro** | Fundo vermelho escuro com listras vermelhas sutis |

## Benefícios

1. **Consistência de marca**: Vermelho é a cor primária do sistema
2. **Clareza visual**: Vermelho transmite "bloqueado/indisponível" intuitivamente
3. **Contraste**: Visível em ambos os temas
4. **Harmonização**: Combina com o ícone de "Cancelado" que já é vermelho

## Arquivo Modificado

| Arquivo | Linhas |
|---------|--------|
| `src/components/agenda-pro/AgendaProCalendar.tsx` | 191, 197, 203, 499 |
