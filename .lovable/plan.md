

# Plano: Permitir 2 Abas Simultâneas por Usuário

## Problema Atual

Quando um usuário abre uma segunda aba, o sistema mostra imediatamente o diálogo de "aba duplicada" e força a escolha de qual aba manter. O limite atual é **1 aba**.

## Solução

Modificar o `TabSessionContext` para permitir **até 2 abas simultâneas**, mostrando o diálogo apenas quando a terceira aba for aberta.

---

## Mudanças Necessárias

### Arquivo 1: `src/contexts/TabSessionContext.tsx`

| Mudança | Descrição |
|---------|-----------|
| Adicionar `MAX_TABS = 2` | Constante configurável para limite de abas |
| Adicionar `timestamp` às mensagens | Para identificar a aba mais antiga |
| Contar PONGs recebidos | Em vez de mostrar diálogo no primeiro PONG |
| Modificar lógica de TAKEOVER | Desconectar apenas a aba mais antiga |

**Código Atual:**
```typescript
case "PONG":
  // Mostra diálogo imediatamente ao receber qualquer PONG
  setShowDuplicateDialog(true);
  break;
```

**Código Novo:**
```typescript
const MAX_TABS = 2;
const activeTabsRef = useRef<Map<string, number>>(new Map()); // tabId -> timestamp
const tabCreatedAtRef = useRef<number>(Date.now());

case "PONG":
  // Adiciona aba à contagem
  activeTabsRef.current.set(message.tabId, message.timestamp || Date.now());
  // Só mostra diálogo se atingir o limite
  if (activeTabsRef.current.size >= MAX_TABS) {
    setShowDuplicateDialog(true);
  }
  break;

case "TAKEOVER":
  // Só termina se for a aba mais antiga
  if (tabCreatedAtRef.current < (message.timestamp || Date.now())) {
    terminateSession();
  }
  break;
```

### Arquivo 2: `src/components/session/DuplicateTabDialog.tsx`

Atualizar o texto para refletir o limite de 2 abas:

**Atual:**
> "O MiauChat já está aberto em outra aba do navegador."

**Novo:**
> "O MiauChat já está aberto em 2 abas. Se você continuar aqui, a aba mais antiga será desconectada."

---

## Fluxo Visual

```text
┌──────────────────────────────────────────────────────────────┐
│                    USUÁRIO ABRE ABA                          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Envia PING     │
                    └─────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │ 0 PONGs         │             │ 1 PONG          │
     │ (nenhuma aba)   │             │ (1 aba existe)  │
     └─────────────────┘             └─────────────────┘
              │                               │
              ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │ ✓ OK            │             │ ✓ OK            │  ← NOVO
     │ Acesso liberado │             │ (< 2 abas)      │
     └─────────────────┘             └─────────────────┘
                                              │
                                              ▼
                                   ┌─────────────────┐
                                   │ 2+ PONGs        │
                                   │ (2+ abas)       │
                                   └─────────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │ Mostrar Diálogo     │
                                   │ "Limite atingido"   │
                                   │                     │
                                   │ [Cancelar]          │
                                   │ [Continuar aqui]    │
                                   └─────────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                                                   │
                    ▼                                                   ▼
         ┌──────────────────┐                             ┌──────────────────┐
         │ Cancelar         │                             │ Continuar        │
         │ → Fecha diálogo  │                             │ → TAKEOVER       │
         │ → Usuário decide │                             │ → Aba mais antiga│
         └──────────────────┘                             │   é desconectada │
                                                          └──────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/contexts/TabSessionContext.tsx` | Implementar contagem de abas e limite de 2 |
| `src/components/session/DuplicateTabDialog.tsx` | Atualizar texto do diálogo |

---

## Detalhes Técnicos da Implementação

### Interface TabMessage Atualizada

```typescript
interface TabMessage {
  type: "PING" | "PONG" | "TAKEOVER";
  tabId: string;
  userId?: string;
  timestamp: number;  // NOVO: para ordenar abas por idade
}
```

### Lógica de Contagem

```typescript
const MAX_TABS = 2;
const activeTabsRef = useRef<Map<string, number>>(new Map());
const tabCreatedAtRef = useRef<number>(Date.now());

// No handler de mensagens:
case "PONG":
  activeTabsRef.current.set(message.tabId, message.timestamp);
  // Continua esperando mais PONGs até o timeout
  break;

// Após o timeout (PING_TIMEOUT_MS):
pingTimeoutRef.current = setTimeout(() => {
  const tabCount = activeTabsRef.current.size;
  if (tabCount >= MAX_TABS) {
    setShowDuplicateDialog(true);
  } else {
    setIsPrimaryTab(true);
  }
}, PING_TIMEOUT_MS);
```

### Lógica de Takeover Inteligente

Quando o usuário clica "Continuar aqui", enviamos TAKEOVER com o timestamp da aba atual. Apenas a aba mais antiga (menor timestamp) será desconectada:

```typescript
case "TAKEOVER":
  // Compara timestamps - apenas a aba mais antiga é terminada
  const myCreatedAt = tabCreatedAtRef.current;
  const requestingTabCreatedAt = message.timestamp;
  
  // Se esta aba é mais antiga que a aba que está pedindo takeover
  if (myCreatedAt < requestingTabCreatedAt) {
    terminateSession();
  }
  break;
```

---

## Impacto

| Aspecto | Status |
|---------|--------|
| Funcionalidades existentes | ✅ Nenhum impacto |
| Performance | ✅ Mesmo overhead |
| Realtime/WebSockets | ⚠️ 2x recursos (aceitável) |
| UX | ✅ Mais flexibilidade |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| 1 aba aberta | ✅ OK | ✅ OK |
| 2 abas abertas | ❌ Diálogo aparece | ✅ OK |
| 3 abas abertas | ❌ Diálogo aparece | ❌ Diálogo aparece |
| Takeover | Desconecta outra aba | Desconecta aba mais antiga |

