

# Correcao: Instagram/Facebook sem receber mensagens + WhatsApp Cloud nao conecta

## Problema 1: Instagram/Facebook - Erro de enum

**Causa raiz encontrada nos logs:**
```
invalid input value for enum case_status: "active"
```

O campo `status` da tabela `conversations` usa um enum `case_status` com os valores:
- `novo_contato`, `triagem_ia`, `aguardando_documentos`, `em_analise`, `em_andamento`, `encerrado`

O codigo no `meta-webhook` (linha 382) tenta inserir `status: "active"`, que **nao existe** no enum. O timestamp ja foi corrigido na alteracao anterior, mas **este** e o erro real que impede a criacao de conversas.

**Correcao:**
- Arquivo: `supabase/functions/meta-webhook/index.ts`
- Linha 382: Trocar `status: "active"` por `status: "novo_contato"`

---

## Problema 2: WhatsApp Cloud - "Conectando..." infinito

**Causa raiz encontrada no codigo:**

No `meta-oauth-callback/index.ts`, o fluxo e sequencial:
1. Troca o code por token (OK)
2. Busca long-lived token (OK)
3. **Busca paginas via `me/accounts`** (linhas 134-137)
4. **Se nao encontrar paginas, retorna erro** (linhas 139-144)
5. So **depois** verifica se e WhatsApp Cloud Embedded Signup (linha 147)

O Embedded Signup gera um token de **system user** que nao tem paginas associadas. Por isso, `me/accounts` retorna vazio e a funcao aborta com "No Facebook Pages found" **antes** de chegar ao handler do WhatsApp Cloud.

**Correcao:**
- Arquivo: `supabase/functions/meta-oauth-callback/index.ts`
- Mover a verificacao de `type === "whatsapp_cloud"` com `phoneNumberId && wabaId` para **antes** da chamada `me/accounts`
- Assim, o Embedded Signup nao precisa de paginas e vai direto para `handleWhatsAppCloudEmbedded`

---

## Resumo das alteracoes

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/meta-webhook/index.ts` | Linha 382: `status: "active"` -> `status: "novo_contato"` |
| `supabase/functions/meta-oauth-callback/index.ts` | Mover handler do WhatsApp Embedded Signup para antes da busca de paginas |

## Resultado esperado

1. **Instagram/Facebook**: Mensagens recebidas criarao conversas com `status: "novo_contato"` sem erro de enum
2. **WhatsApp Cloud**: O fluxo Embedded Signup ira direto para o handler correto sem exigir paginas, finalizando a conexao normalmente

