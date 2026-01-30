

# Adicionar Alerta Visual de Link Público Inativo

## Objetivo

Adicionar um alerta informativo no componente `AgendaProPublicLink` que apareça quando:
- O slug está configurado (`public_slug` preenchido)
- MAS o switch "Agendamento Online" está **desativado** (`public_booking_enabled = false`)

Isso evitará a confusão onde o usuário configura o slug, copia o link, mas ao acessar recebe "Agenda não encontrada".

---

## Modificação

### Arquivo: `src/components/agenda-pro/AgendaProPublicLink.tsx`

Adicionar um alerta visual usando o componente `Alert` do shadcn/ui:

```typescript
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

// Dentro do componente, após a seção do slug:

{/* NOVO: Alerta quando slug existe mas link está desativado */}
{settings?.public_slug && !settings?.public_booking_enabled && (
  <Alert variant="destructive" className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900">
    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
    <AlertDescription className="text-amber-800 dark:text-amber-300">
      <strong>Link inativo!</strong> Ative o "Agendamento Online" acima para que 
      seus clientes possam acessar este link. Atualmente, o link mostrará 
      "Agenda não encontrada".
    </AlertDescription>
  </Alert>
)}
```

---

## Fluxo Visual Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│  LINK PÚBLICO - ESTADOS                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Slug vazio + Switch OFF:                                     │
│     → Mostra apenas campos normais                               │
│                                                                  │
│  2. Slug preenchido + Switch OFF:                                │
│     → Mostra link + ⚠️ ALERTA AMARELO                           │
│     → "Link inativo! Ative o Agendamento Online..."              │
│                                                                  │
│  3. Slug preenchido + Switch ON:                                 │
│     → Mostra link sem alerta ✅                                  │
│     → Link funciona normalmente                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco de regressão | Muito baixo - apenas adição de UI condicional |
| Arquivos modificados | 1 (`AgendaProPublicLink.tsx`) |
| Componentes existentes | Usa `Alert` do shadcn/ui já instalado |
| Funcionamento atual | Não afeta nenhuma lógica existente |

---

## Código Final

A modificação adiciona:
1. Import do componente `Alert` e ícone `AlertTriangle`
2. Bloco condicional que renderiza o alerta apenas quando `slug existe` AND `public_booking_enabled = false`
3. Estilo âmbar (warning) para não assustar, mas chamar atenção

