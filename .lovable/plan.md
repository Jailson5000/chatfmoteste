
# Correção: IA Não Consegue Mudar para Status Diferentes de "Qualificado"

## Problema Identificado

A IA está tentando mudar o status para "DESQUALIFICADO", mas o sistema está aplicando "Qualificado" no lugar.

### Causa Raiz

A lógica de busca de status na função `handleCrmToolCall` usa `includes()` bidirecional que causa **falso positivo**:

```javascript
// Linha 674-677 do ai-chat/index.ts
const targetStatus = statuses?.find((s: any) => 
  s.name.toLowerCase().includes(args.status_name.toLowerCase()) ||
  args.status_name.toLowerCase().includes(s.name.toLowerCase())
);
```

**O que acontece quando a IA passa `"DESQUALIFICADO"`:**

```text
1. find() itera nos status na ordem do array
2. Primeiro encontra "Qualificado"
3. Testa: "qualificado".includes("desqualificado") → FALSE
4. Testa: "desqualificado".includes("qualificado") → TRUE ← MATCH ERRADO!
5. Retorna "Qualificado" imediatamente (sem verificar "DESQUALIFICADO")
```

Isso explica por que:
- A IA chama `change_status("DESQUALIFICADO")` (confirmado nos logs)
- Mas o banco registra mudança para "Qualificado"
- O mesmo problema afeta qualquer par de status onde um contém o outro como substring

### Evidências nos Logs

```text
Edge Function Log:
15:15:59 - Executing CRM tool: change_status { status_name: "DESQUALIFICADO" }

client_actions no Banco:
15:16:00 - IA Maria alterou status para Qualificado (deveria ser DESQUALIFICADO!)
```

---

## Solução Proposta

Implementar uma estratégia de matching com **prioridade por especificidade**:

1. **Primeiro:** Buscar match exato (case-insensitive)
2. **Segundo:** Buscar match onde o nome do status **começa** com o termo buscado
3. **Terceiro:** Buscar match por substring (atual, como fallback)

### Novo Algoritmo

```javascript
// Prioridade 1: Match exato (case-insensitive)
let targetStatus = statuses?.find((s: any) => 
  s.name.toLowerCase() === args.status_name.toLowerCase()
);

// Prioridade 2: Match por início do nome (startsWith)
if (!targetStatus) {
  targetStatus = statuses?.find((s: any) => 
    s.name.toLowerCase().startsWith(args.status_name.toLowerCase()) ||
    args.status_name.toLowerCase().startsWith(s.name.toLowerCase())
  );
}

// Prioridade 3: Match por substring (fallback - comportamento atual)
if (!targetStatus) {
  targetStatus = statuses?.find((s: any) => 
    s.name.toLowerCase().includes(args.status_name.toLowerCase()) ||
    args.status_name.toLowerCase().includes(s.name.toLowerCase())
  );
}
```

### Por que isso resolve

Quando a IA passa `"DESQUALIFICADO"`:
1. Match exato: `"qualificado" === "desqualificado"` → FALSE
2. Match exato: `"desqualificado" === "desqualificado"` → **TRUE** ✓
3. Retorna "DESQUALIFICADO" corretamente

---

## Arquivo a Alterar

**`supabase/functions/ai-chat/index.ts`**

Localização: Linhas 674-677 (função `handleCrmToolCall`, case `change_status`)

### Mudança Específica

```text
ANTES (linhas 674-677):
const targetStatus = statuses?.find((s: any) => 
  s.name.toLowerCase().includes(args.status_name.toLowerCase()) ||
  args.status_name.toLowerCase().includes(s.name.toLowerCase())
);

DEPOIS:
// Priority matching: exact > startsWith > includes
let targetStatus = statuses?.find((s: any) => 
  s.name.toLowerCase() === args.status_name.toLowerCase()
);

if (!targetStatus) {
  targetStatus = statuses?.find((s: any) => 
    s.name.toLowerCase().startsWith(args.status_name.toLowerCase()) ||
    args.status_name.toLowerCase().startsWith(s.name.toLowerCase())
  );
}

if (!targetStatus) {
  targetStatus = statuses?.find((s: any) => 
    s.name.toLowerCase().includes(args.status_name.toLowerCase()) ||
    args.status_name.toLowerCase().includes(s.name.toLowerCase())
  );
}
```

---

## Impacto e Testes

### Cenários de Teste

| Status Buscado | Antes (Bug) | Depois (Corrigido) |
|----------------|-------------|-------------------|
| DESQUALIFICADO | Qualificado ❌ | DESQUALIFICADO ✓ |
| Qualificado | Qualificado ✓ | Qualificado ✓ |
| Cliente Novo | Cliente Novo ✓ | Cliente Novo ✓ |
| Análise | Análise ✓ | Análise ✓ |

### Retrocompatibilidade

- A correção é **totalmente retrocompatível** porque mantém o fallback para `includes()`
- Apenas adiciona camadas de prioridade para matches mais específicos
- Não quebra nenhum fluxo existente que já funciona

### Teste Manual Recomendado

1. Em uma conversa controlada pela IA "Maria":
   - Disparar a condição que deve mudar para "DESQUALIFICADO"
   - Verificar se o status mudou corretamente

2. Verificar outros status:
   - Testar mudança para "Qualificado" (deve continuar funcionando)
   - Testar status sem conflito de substring (ex: "Cliente Novo")

---

## Resumo Técnico

| Item | Detalhes |
|------|----------|
| Tipo de bug | Lógica de matching com falso positivo |
| Arquivo afetado | `supabase/functions/ai-chat/index.ts` |
| Linhas afetadas | 674-677 |
| Risco da correção | Baixo (adiciona prioridade, não remove funcionalidade) |
| Deploy necessário | Sim (edge function ai-chat) |
