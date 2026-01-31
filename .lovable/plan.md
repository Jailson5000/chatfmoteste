
# Plano: Adicionar Foto do Contato no Header Central de Conversas

## Situação Atual

O header central da página de Conversas (área do chat) mostra apenas as **iniciais do contato** em um círculo colorido:

```tsx
// Linha 3556-3565 - Código atual
<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
  <span className="text-sm font-semibold text-primary">
    {(selectedConversation.contact_name || ...).slice(0, 2).toUpperCase()}
  </span>
</div>
```

O `avatar_url` **já está disponível** via `selectedConversation.client?.avatar_url` (confirmado na linha 4499).

---

## Alterações Necessárias

### 1. Adicionar Importação do Avatar

Adicionar após a linha 61:

```typescript
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
```

### 2. Substituir Div por Avatar no Header (linhas 3556-3565)

**De:**
```tsx
<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
  <span className="text-sm font-semibold text-primary">
    {(selectedConversation.contact_name || selectedConversation.contact_phone || "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()}
  </span>
</div>
```

**Para:**
```tsx
<Avatar className="h-10 w-10 flex-shrink-0 border border-primary/20">
  {(selectedConversation as any).client?.avatar_url ? (
    <AvatarImage 
      src={(selectedConversation as any).client.avatar_url} 
      alt={selectedConversation.contact_name || "Avatar"} 
    />
  ) : null}
  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
    {(selectedConversation.contact_name || selectedConversation.contact_phone || "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()}
  </AvatarFallback>
</Avatar>
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Conversations.tsx` | Adicionar import do Avatar + substituir div por Avatar no header |

---

## Resultado Esperado

- **Com foto**: Exibe a foto do WhatsApp do contato
- **Sem foto**: Fallback para iniciais (mesmo visual atual)
- **Estilo**: Mantém tamanho 10x10 (40px), borda sutil para harmonizar

---

## Garantias de Segurança

- ✅ **Sem regressões**: O fallback para iniciais mantém o comportamento atual
- ✅ **Retrocompatível**: O campo `avatar_url` é opcional
- ✅ **Dados já disponíveis**: O hook `useConversations` já retorna `client.avatar_url`
- ✅ **Sem alteração de lógica**: Apenas mudança visual no header
