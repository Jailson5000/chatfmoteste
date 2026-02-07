

# Plano: Bloquear Contatos com LID (Lead ID) do WABA

## Problema Identificado

O contato **"52746862522561"** não é um número de telefone real - é um **LID (Lead ID)** da WhatsApp Business API (WABA).

### Análise dos Dados

| Campo | Valor | Observação |
|-------|-------|------------|
| `remote_jid` | `52746862522561@lid` | Formato LID (não é telefone) |
| `contact_phone` | `52746862522561` | Número inválido extraído do LID |
| `msg_count` | **0** | Nenhuma mensagem real |
| `origin` | `whatsapp` | Veio do webhook |

### O que é um LID?

O WhatsApp Business API (WABA) usa LIDs como identificadores temporários para leads que:
- Clicaram em um anúncio Click-to-WhatsApp mas ainda não enviaram mensagem
- São contatos em transição no sistema da Meta
- Não completaram o handshake de conversa

Esses IDs **nunca devem gerar conversas** no sistema porque:
1. Não são números de telefone válidos
2. Não podem receber mensagens
3. Eventualmente são convertidos para `@s.whatsapp.net` quando o usuário envia uma mensagem real

---

## Solução

Adicionar validação no webhook para **bloquear mensagens com formato `@lid`**, similar ao bloqueio existente para grupos (`@g.us`).

---

## Alterações Necessárias

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

**Após a linha ~3828** (depois do bloqueio de grupos), adicionar bloqueio de LIDs:

```typescript
// ========================================
// CRITICAL: BLOCK LID (Lead ID) MESSAGES
// LIDs are temporary internal IDs from WABA, not real phone numbers
// They have @lid suffix and should not create conversations
// ========================================
const isLidMessage = remoteJid.endsWith('@lid');
if (isLidMessage) {
  logDebug('MESSAGE', `🚫 IGNORING LID MESSAGE - Not a valid phone number`, { 
    requestId, 
    remoteJid,
    extractedNumber: phoneNumber,
    instanceName: instance?.instance_name,
    reason: 'LID is a temporary WABA internal ID, not a real phone number'
  });
  return new Response(
    JSON.stringify({ 
      success: true, 
      action: 'ignored',
      reason: 'lid_message_blocked',
      message: 'Messages from LID (Lead ID) contacts are not processed'
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

---

## Limpeza do Registro Existente

Após implementar o bloqueio, será necessário:

1. **Excluir a conversa inválida** (não tem mensagens, é seguro deletar)
2. **Excluir o client vinculado** (se existir)

Query de limpeza:

```sql
-- Verificar se há client vinculado
SELECT * FROM clients WHERE phone = '52746862522561';

-- Deletar a conversa inválida (0 mensagens)
DELETE FROM conversations WHERE id = 'd60f0756-2f56-4f73-a964-8d20bcfd9228';

-- Se existir client, deletar também
DELETE FROM clients WHERE phone = '52746862522561' AND law_firm_id = '...';
```

---

## Fluxo Antes e Depois

```text
ANTES (Bug):
┌─────────────────────────────────────────────────────────────────┐
│  Webhook recebe: remoteJid = "52746862522561@lid"               │
│                                                                 │
│  ↓ Extrai phoneNumber = "52746862522561"                        │
│  ↓ Verifica grupo? NÃO (@g.us)                                  │
│  ↓ Cria conversa com número inválido ❌                         │
│  ↓ Contato "fantasma" aparece na lista                          │
└─────────────────────────────────────────────────────────────────┘

DEPOIS (Corrigido):
┌─────────────────────────────────────────────────────────────────┐
│  Webhook recebe: remoteJid = "52746862522561@lid"               │
│                                                                 │
│  ↓ Verifica grupo? NÃO                                          │
│  ↓ Verifica LID? SIM (@lid) ✓                                   │
│  ↓ BLOQUEIA - Retorna 200 sem criar conversa ✓                  │
│  ↓ Log: "LID is a temporary WABA internal ID"                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco | **BAIXO** - LIDs nunca deveriam gerar conversas |
| Segurança | **MELHORIA** - Evita lixo no banco |
| Performance | **NENHUM** - Apenas uma verificação string |
| Retrocompatibilidade | **100%** - Não afeta conversas válidas |

---

## Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/evolution-webhook/index.ts` | Adicionar bloqueio de LID |

---

## Pós-Implementação

1. Fazer deploy da edge function
2. Executar query de limpeza para remover o registro inválido existente
3. Monitorar logs para confirmar que LIDs estão sendo bloqueados

