

# Ajuste: Atualizar Referências para Agenda Pro no Admin

## Resumo

Manter o texto atual na página do cliente (`Onboarding.tsx`) e apenas atualizar os textos no painel admin para refletir o uso da Agenda Pro.

---

## O que NÃO muda

**`src/pages/Onboarding.tsx`** - Texto do cliente permanece intacto:
- "Agende uma reunião com nossa equipe de suporte para tirar suas dúvidas ao vivo."

---

## O que muda

### `src/pages/global-admin/GlobalAdminOnboarding.tsx`

| Local | Antes | Depois |
|-------|-------|--------|
| Descrição do card (linha 291) | "Link para agendamento de reunião de onboarding (Calendly, Google Calendar, etc.)" | "Link da Agenda Pro para agendamento de reunião de onboarding" |
| Placeholder do input (linha 302) | `https://calendly.com/seu-link` | `https://suporte.miauchat.com.br/agendar/reuniao` |

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/global-admin/GlobalAdminOnboarding.tsx` | Atualizar descrição e placeholder para Agenda Pro |

---

## Fluxo do Cliente

```text
1. Cliente acessa página de Onboarding
   ↓
2. Vê seção "Seus Agendamentos" 
   ↓
3. Lê: "Agende uma reunião com nossa equipe de suporte para tirar suas dúvidas ao vivo."
   ↓
4. Clica em "Agendar Reunião"
   ↓
5. Abre link da Agenda Pro (https://suporte.miauchat.com.br/agendar/reuniao)
   ↓
6. Cliente agenda diretamente no sistema de vocês
   ↓
7. Vocês enviam o link da reunião de vídeo após o agendamento
```

---

## Resultado

- Admin vê placeholder correto da Agenda Pro
- Cliente mantém experiência atual
- Link redireciona para sistema próprio de agendamento

