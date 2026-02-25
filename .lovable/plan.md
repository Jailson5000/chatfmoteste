

# Correção: Contatos Vinculados Entre Instâncias Diferentes

## Diagnóstico

Confirmado no banco de dados: existe **1 único registro de cliente** (`44ccc92a`) para o telefone `5519983391406`, mas **2 conversas** apontando para ele em instâncias diferentes:

| Conversa | Instância | Client ID |
|---|---|---|
| `c40d99be` | `inst_7tdqx6d8` (FMOANTIGO) | `44ccc92a` ← mesmo |
| `2089163c` | `inst_cgo5wn6p` (outra) | `44ccc92a` ← mesmo |

Como ambas as conversas referenciam o **mesmo client_id**, alterar status/nome/departamento em uma afeta a outra.

## Causa Raiz

O bug está no `uazapi-webhook` (linhas 898-905). Ao buscar/criar o cliente, ele **não filtra por `whatsapp_instance_id`**:

```text
// BUGADO (uazapi-webhook):
.from("clients")
.eq("law_firm_id", lawFirmId)
.or(`phone.eq.${normalizedPhone},phone.eq.+${normalizedPhone}`)
// ❌ Falta: .eq("whatsapp_instance_id", instance.id)

// CORRETO (evolution-webhook, já implementado):
.from("clients")
.eq("law_firm_id", lawFirmId)
.eq("whatsapp_instance_id", instance.id)  // ✅
.or(`phone.eq.${phoneNumber},phone.ilike.%${phoneEnding}`)
```

Além disso, os Steps 3 e 4 da busca de conversa (linhas 760-828) são problemáticos: quando encontram uma conversa "órfã" de outra instância, eles **reassociam o cliente da instância antiga para a nova**, quebrando o vínculo original.

## Correção Proposta

### 1. `supabase/functions/uazapi-webhook/index.ts` — Busca de cliente por instância

Alterar a seção "FIND OR CREATE CLIENT" (linhas ~898-934) para:
- Buscar cliente filtrando por `whatsapp_instance_id = instance.id`
- Se não encontrar, **criar um novo cliente** para esta instância (mesmo que exista cliente com mesmo telefone em outra instância)

### 2. `supabase/functions/uazapi-webhook/index.ts` — Orphan Steps 3 e 4

Nos passos de busca de conversa órfã (linhas 760-828):
- **Remover** a lógica que reassocia o `client.whatsapp_instance_id` ao encontrar órfãos
- Em vez disso, quando uma conversa órfã é reassociada para uma nova instância, criar um **novo cliente** para a nova instância em vez de mover o existente

### 3. Correção dos dados existentes (SQL migration)

Criar migration para corrigir o caso específico do "Excluir laercio":
- Criar um novo registro de cliente para a instância `inst_cgo5wn6p` com os mesmos dados
- Atualizar a conversa `2089163c` para apontar para o novo cliente
- Manter o cliente original vinculado à instância `inst_7tdqx6d8`

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Filtrar busca de cliente por `whatsapp_instance_id`; criar cliente separado por instância; corrigir lógica de órfãos |
| Nova migration SQL | Desduplicar o caso existente no banco |

## Detalhes Técnicos

A correção alinha o `uazapi-webhook` com a lógica já correta do `evolution-webhook`, que desde janeiro implementa busca de cliente **por instância**. O índice único `idx_clients_phone_norm_law_firm_instance` já suporta múltiplos clientes com mesmo telefone em instâncias diferentes — o bug é apenas na lógica de busca do webhook uazapi.

