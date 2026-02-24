

# Kanban Nao Mostra Numeros de Telefone da Instancia

## Diagnostico

No `KanbanCard.tsx`, a funcao `getConnectionInfo()` (linha 156-163) so exibe o numero quando `phone_number` esta preenchido na tabela `whatsapp_instances`. Duas instancias no banco tem `phone_number` como `null`:

- **Z9089** (id: b2622a7e) → `phone_number: null`
- **Z3528** (id: 10b70877) → `phone_number: null`

Quando `phone_number` e null, o codigo retorna `{ label: "----" }`, causando os cards sem numero vistos no screenshot.

## Correcao

### Arquivo: `src/components/kanban/KanbanCard.tsx`

Na funcao `getConnectionInfo()`, quando `phone_number` for null, exibir o `display_name` da instancia como fallback em vez de "----":

```typescript
// Linha 156-163 - Adicionar fallback para display_name
const phoneNumber = conversation.whatsapp_instance?.phone_number;
if (phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length >= 4) {
    return { label: `•••${digits.slice(-4)}`, isWidget: false, tooltipText: ... };
  }
}
// FALLBACK: mostrar display_name quando phone_number nao existe
if (conversation.whatsapp_instance?.display_name || conversation.whatsapp_instance?.instance_name) {
  return { 
    label: conversation.whatsapp_instance.display_name || conversation.whatsapp_instance.instance_name, 
    isWidget: false, 
    tooltipText: conversation.whatsapp_instance.display_name || "WhatsApp" 
  };
}
return { label: "----", isWidget: false, tooltipText: "Canal não identificado" };
```

A mesma logica ja existe para `WHATSAPP_CLOUD` (linha 152-154). Esta correcao alinha o comportamento do caso padrao.

## Resultado Esperado

- Cards com instancias sem `phone_number` mostrarao o nome da instancia (ex: "Z9089", "Z3528")
- Cards com `phone_number` preenchido continuam mostrando `•••XXXX`
- Nenhum card mostra "----" a menos que nao tenha instancia associada

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/components/kanban/KanbanCard.tsx` | Fallback para display_name em getConnectionInfo |

