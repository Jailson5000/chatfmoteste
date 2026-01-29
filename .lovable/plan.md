

# Plano: Ajustes Landing Page + Correção de Nomes WABA em Conversas Existentes

## Resumo dos Problemas

### 1. Landing Page
- **Botão "Entrar"**: Precisa ser removido do header
- **"Falar com especialista"**: Mudar para texto mais chamativo e redirecionar para `/register` ao invés de WhatsApp
- **Área de Teste Grátis**: Adicionar fundo verde claro transparente ao redor

### 2. WABA - Contatos sem Nome (Conversas Existentes)
**Problema**: A função `getContactName()` com suporte a campos WABA alternativos (`notify`, `verifiedName`, `formattedName`, `sender.pushName`) foi adicionada apenas para **novas conversas**.

Para **conversas existentes**, o código ainda usa apenas `data.pushName`:
```typescript
// Linha 4312 - Só verifica data.pushName
const shouldUpdateContactName = !isFromMe && !conversation.client_id && data.pushName;

// Linha 4338 - Só usa data.pushName
contact_name: shouldUpdateContactName ? data.pushName : conversation.contact_name,
```

**Resultado**: Mensagens de WABA em conversas existentes não atualizam o nome do contato porque `pushName` está vazio.

---

## Alterações Propostas

### Parte 1: Landing Page (`LandingPage.tsx`)

#### 1.1 Remover botão "Entrar"
Remover o Link para `/auth` no header (linhas 236-241):
```tsx
// REMOVER ESTE BLOCO
<Link
  to="/auth"
  className="text-sm text-white/50 hover:text-white transition-colors"
>
  Entrar
</Link>
```

#### 1.2 Alterar "Falar com especialista" no Hero
Mudar o botão secundário (linhas 311-321) para:
- Novo texto: **"Testar gratuitamente"** ou **"Teste 7 dias grátis"**
- Redirecionar para `/register` ao invés de link para `#contato`
- Ícone adequado (Rocket ou similar)

```tsx
// ANTES
<Button asChild variant="outline" ...>
  <a href="#contato">
    <Phone className="mr-2 h-4 w-4" />
    Falar com especialista
  </a>
</Button>

// DEPOIS
<Button
  variant="outline"
  onClick={() => navigate("/register")}
>
  <Rocket className="mr-2 h-4 w-4" />
  Teste 7 dias grátis
</Button>
```

#### 1.3 Alterar botão Enterprise nos planos
No card Enterprise (linhas 740-743), mudar:
- Texto: **"Solicitar proposta"** (mais chamativo que "Falar com especialista")
- Redirecionar para `/register?plan=enterprise`

```tsx
// ANTES
onClick={() => window.open("https://wa.me/5563999540484...", "_blank")

// DEPOIS  
onClick={() => navigate("/register?plan=enterprise")}
```

#### 1.4 Adicionar fundo verde ao banner Trial
Aplicar estilo verde claro transparente ao banner (linha 668):

```tsx
// ANTES
<div className="py-3 px-4 rounded-lg border border-white/[0.06] bg-white/[0.01] ...">

// DEPOIS
<div className="py-3 px-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 ...">
```

---

### Parte 2: Correção WABA para Conversas Existentes (`evolution-webhook/index.ts`)

#### 2.1 Criar função auxiliar reutilizável
Mover a lógica `getContactName()` para fora do bloco de criação de nova conversa, tornando-a acessível para o update:

```typescript
// Função auxiliar para extrair nome do contato com suporte a WABA
const extractContactName = (messageData: MessageData, isFromMe: boolean, phoneNumber: string): string => {
  if (isFromMe) return phoneNumber;
  return messageData.pushName || 
         messageData.notify || 
         messageData.verifiedName || 
         messageData.formattedName ||
         messageData.sender?.pushName ||
         messageData.sender?.name ||
         phoneNumber;
};
```

#### 2.2 Atualizar lógica de update para usar extração WABA
Modificar a verificação e atribuição de contact_name para usar a função auxiliar:

```typescript
// ANTES (linha 4312)
const shouldUpdateContactName = !isFromMe && !conversation.client_id && data.pushName;

// DEPOIS - Verifica qualquer campo de nome WABA
const extractedName = extractContactName(data, isFromMe, phoneNumber);
const shouldUpdateContactName = !isFromMe && !conversation.client_id && extractedName !== phoneNumber;

// ANTES (linha 4338)
contact_name: shouldUpdateContactName ? data.pushName : conversation.contact_name,

// DEPOIS - Usa o nome extraído
contact_name: shouldUpdateContactName ? extractedName : conversation.contact_name,
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/landing/LandingPage.tsx` | Remover "Entrar", alterar "Falar com especialista", adicionar fundo verde |
| `supabase/functions/evolution-webhook/index.ts` | Aplicar extração WABA no update de conversas existentes |

---

## Resposta à Pergunta sobre WABA

> "Ainda não aparece o nome nem a mensagem que foi recebida pelo WABA. Vai atualizar nas próximas?"

**Resposta**: O código atual só extrai nomes WABA para **novas conversas**. Para conversas existentes, a lógica ainda usa apenas `pushName`. Com esta correção:

- **Próximas mensagens**: Sim, o nome será extraído corretamente dos campos WABA alternativos
- **Conversas existentes**: Se receberem nova mensagem do cliente, o nome será atualizado
- **Mensagens já salvas**: O conteúdo já está no banco de dados, mas figurinhas antigas podem aparecer como "📎 Mídia" (precisariam reprocessamento)

---

## Fluxo Visual das Mudanças

```
┌─────────────────────────────────────────────────────────────────┐
│  LANDING PAGE - ANTES                                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [Logo]                    [Entrar] [Começar]             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Quero conhecer] [📞 Falar com especialista → WhatsApp]        │
│                                                                  │
│  ┌─ Trial Banner (sem destaque) ─────────────────────────────┐  │
│  │ Faça seu cadastro... 7 dias...                            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

                           ▼

┌─────────────────────────────────────────────────────────────────┐
│  LANDING PAGE - DEPOIS                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [Logo]                              [Começar]             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Quero conhecer] [🚀 Teste 7 dias grátis → /register]          │
│                                                                  │
│  ┌─ Trial Banner (VERDE CLARO) ──────────────────────────────┐  │
│  │ ✨ Faça seu cadastro... 7 dias...                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Benefícios

1. **CTA mais claro**: "Teste 7 dias grátis" é mais direto que "Falar com especialista"
2. **Fluxo simplificado**: Todos os caminhos levam ao registro
3. **Destaque visual**: Banner verde chama atenção para o trial grátis
4. **WABA corrigido**: Nomes de contatos WABA serão extraídos corretamente para conversas existentes
5. **Interface limpa**: Menos botões = menos confusão para o visitante

