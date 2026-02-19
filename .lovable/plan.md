

# Plano: Melhorar Resiliencia de Sessao e Adicionar Botao de Reconfigurar Webhooks

## Parte 1: Onde Reaplicar Webhooks (MESSAGES_UPDATE)

Atualmente, o painel Global Admin > Conexoes **nao tem** um botao para reaplicar webhooks em massa. Existem duas opcoes:

**Opcao A (rapida):** Adicionar um botao "Reaplicar Webhooks" ao lado de "Sincronizar Evolution" no header da pagina Global Admin Conexoes. Ele chamara `global_configure_webhook` para cada instancia conectada.

**Opcao B (manual):** Ir instancia por instancia na pagina de Conexoes do tenant (nao global admin) e clicar no icone de engrenagem (tooltip "Reconfigurar webhook") que ja existe.

O plano implementara a **Opcao A** -- botao em massa no Global Admin.

### Implementacao

1. No `useGlobalAdminInstances.tsx`, adicionar mutation `reapplyAllWebhooks` que:
   - Filtra instancias com status `connected`
   - Chama `evolution-api` com action `global_configure_webhook` para cada uma (em sequencia para nao sobrecarregar)
   - Retorna contagem de sucesso/falha

2. No `GlobalAdminConnections.tsx`, adicionar botao "Reaplicar Webhooks" no header (ao lado de "Sincronizar Evolution")

---

## Parte 2: Melhorar Resiliencia de Sessao (Desconexoes)

Tres causas identificadas para desconexoes:

### Causa 1: `handleApiError` muito agressivo

O `handleApiError` em `useAuth.tsx` (linhas 137-166) faz logout se **qualquer** erro contiver as palavras "token", "session" ou "unauthorized". Isso e perigoso porque:
- Erros de rede podem conter "session" no corpo
- Erros de RLS ou permissao retornam 403
- Um unico erro transitorio causa logout total

**Correcao:** Tornar a deteccao mais precisa -- verificar **somente** `statusCode === 401` e mensagens especificas de JWT/refresh token. Remover 403 e strings genericas como "session" e "unauthorized".

### Causa 2: Timeout de inicializacao de 10 segundos

O `AUTH_INIT_TIMEOUT_MS = 10000` (linha 10) limpa a sessao se o SDK demorar mais de 10s para responder. Em conexoes lentas (comum no Brasil), isso forca re-login.

**Correcao:** Aumentar para 20 segundos e **nao limpar** a sessao no timeout -- apenas liberar o loading para o usuario nao ficar preso, mantendo a sessao existente no localStorage ate o SDK responder.

### Causa 3: Tab Session TAKEOVER em reloads

Quando o usuario da F5, a nova pagina envia PING antes da aba antiga morrer. Com 2 abas "ativas" (a antiga + a recarregada), a proxima aba pode acionar o dialog de duplicata.

**Correcao:** Adicionar um delay de 1 segundo antes do PING no `TabSessionContext.tsx` para dar tempo da aba antiga ser finalizada pelo `beforeunload`.

---

## Detalhes Tecnicos

### Arquivo 1: `src/hooks/useAuth.tsx`

- Linha 10: `AUTH_INIT_TIMEOUT_MS` de 10000 para 20000
- Linhas 176-186 (timeout handler): Em vez de limpar sessao, apenas liberar loading sem tocar em session/user
- Linhas 141-148 (handleApiError): Remover 403, remover "session" e "unauthorized" das strings checadas. Manter apenas 401, "JWT", "bad_jwt", "invalid_grant", "refresh_token"

### Arquivo 2: `src/contexts/TabSessionContext.tsx`

- Apos `initChannel()`, adicionar delay de 1s antes de enviar o PING (setTimeout 1000ms)
- Isso evita conflito com F5/reload

### Arquivo 3: `src/hooks/useGlobalAdminInstances.tsx`

- Adicionar mutation `reapplyAllWebhooks` que itera sobre instancias conectadas e chama `global_configure_webhook`

### Arquivo 4: `src/pages/global-admin/GlobalAdminConnections.tsx`

- Adicionar botao "Reaplicar Webhooks" no header com icone de Settings2
- Toast com resultado (X configuradas, Y falhas)

---

## Resumo

| Item | Detalhe |
|---|---|
| Arquivos alterados | 4 |
| Risco | Baixo -- todas as mudancas sao defensivas |
| Impacto | Menos desconexoes para atendentes |
| Reversivel | Sim |
| Bonus | Botao "Reaplicar Webhooks" no Global Admin para atualizar todas as instancias |

