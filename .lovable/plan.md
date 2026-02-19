

# Alteracoes Seguras para Implementar

## Resumo

Duas alteracoes que **nao quebram nada** no projeto:

---

## 1. Reduzir frequencia do cron `process-follow-ups`

**O que muda:** O cron job que processa follow-ups passa de **a cada 1 minuto** para **a cada 5 minutos**.

**Por que nao quebra:**
- Os follow-ups tipicos tem delay de 10 minutos ou mais (com a nova regra abaixo)
- A logica de processamento nao muda -- so roda com menos frequencia
- No pior caso, um follow-up e enviado 4 minutos depois do previsto (imperceptivel para o cliente)

**Economia:** ~12.960 invocacoes/mes (de 43.200 para 8.640)

**Alteracao:** Uma unica query SQL para atualizar o cron de `* * * * *` para `*/5 * * * *`.

---

## 2. Follow-ups: minimo 10 minutos, incrementos de 10

**O que muda no frontend** (`StatusFollowUpEditor.tsx`):

- Ao criar novo follow-up: valor padrao muda de **30** para **10** minutos
- Campo de minutos: `min=10`, `step=10`
- Validacao: ao digitar um valor, arredonda para o multiplo de 10 mais proximo (minimo 10)
- Placeholder visual atualizado de "30 min" para "10 min"
- Quando a unidade for "hora" ou "dia", incremento continua sendo 1 (nao muda)

**Por que nao quebra:**
- Follow-ups ja cadastrados com valores antigos (ex: 30 min) continuam funcionando normalmente
- So afeta a criacao/edicao de novos follow-ups na interface
- Nao altera banco de dados, nao altera Edge Functions

---

## O que NAO vamos fazer (quebraria)

| Ideia | Por que quebraria |
|---|---|
| Migrar `check-instance-alerts` para SQL | Envia emails via Resend API -- impossivel em SQL puro |
| Migrar `process-task-due-alerts` para SQL | Envia emails e WhatsApp -- precisa de Edge Function |
| Migrar `tenant-health-check` para SQL | Chama `send-admin-notification` via HTTP |
| Consolidar Edge Functions em 1 "master" | Risco medio -- chamadas internas podem falhar silenciosamente e afetar todas as 3 funcoes. Melhor deixar para o futuro |

---

## Resumo tecnico

| Item | Detalhe |
|---|---|
| Arquivos alterados | 1 componente React (`StatusFollowUpEditor.tsx`) |
| SQL executado | 1 query para atualizar frequencia do cron |
| Edge Functions | Nenhuma alterada |
| Banco de dados | Nenhuma tabela alterada |
| Economia estimada | ~12.960 invocacoes/mes |
| Risco | Zero -- nenhuma logica existente e removida ou alterada |

