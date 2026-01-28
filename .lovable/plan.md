
## Objetivo
Eliminar definitivamente a “tela preta” ao selecionar departamentos em **Configurações → Membros**, tanto no fluxo de **Convidar membro** quanto no de **Editar permissões**, sem causar regressões.

---

## O que sabemos até agora (e por que o problema ainda pode acontecer)
- A “tela preta” visualmente se parece com um **overlay modal** (camada preta) ficando ativo/“travado” enquanto o conteúdo some.
- O problema ocorre **no momento do clique/seleção do departamento**, o que indica que algo relacionado a evento de clique/foco dentro de um Dialog/Modal está acionando um comportamento inesperado (fechamento/estado inconsistente) ou gerando erro que desmonta a UI sob o overlay.
- Existem **dois fluxos** com seleção de departamentos:
  1) **InviteMemberDialog** (Convidar Membro) — lista dentro de `ScrollArea` e item com **onClick no container + onCheckedChange no Checkbox** (pode disparar duas vezes a mudança, ou causar interações indesejadas com “outside click”/foco).
  2) **Edição de membro em Settings.tsx** — lista com `<label>` envolvendo `Checkbox` (pode gerar comportamentos de clique/foco inesperados em Radix quando combinado com Dialog).

Mesmo após mover o Dialog para fora do loop, ainda há pontos que podem manter o overlay “preso”: principalmente **event bubbling + handlers duplicados + onOpenChange mal interpretado**.

---

## Hipóteses mais prováveis (prioridade)
### H1) “Clique duplo lógico” no convite (container onClick + Checkbox onCheckedChange)
No `InviteMemberDialog`, clicar no checkbox dispara:
- `Checkbox.onCheckedChange(...)`
- e também o `div.onClick(...)` (bubbling)
Isso pode:
- alternar o estado duas vezes (marca e desmarca instantaneamente),
- causar rerenders e interações estranhas com o Dialog (dependendo de foco/outside-click),
- e em alguns cenários deixar o overlay ativo sem conteúdo “visível”.

### H2) Eventos de pointer/click sendo interpretados como “outside click” do Dialog
Em Radix Dialog, dependendo do elemento e do evento (pointerdown/click), pode ocorrer fechamento/estado inconsistente se o evento “vaza” e o Dialog entende que foi interação externa.

### H3) Erro runtime disparado no clique (UI desmonta e fica só o fundo)
Sem logs do momento exato do clique, precisamos adicionar instrumentação pontual (sem impacto) para capturar exceções e confirmar a causa.

---

## Estratégia de correção (mínima, segura e sem quebrar nada)
Vamos atacar de forma **cirúrgica**, com mudanças pequenas e isoladas:

### 1) Corrigir o fluxo “Convidar Membro” (InviteMemberDialog) — remover duplicidade e travar bubbling
**Mudanças:**
- Remover o `onClick` do container da linha do departamento **OU** garantir que o clique no checkbox não dispare o onClick do container.
- Implementar handler de toggle apenas em um lugar (preferência: no checkbox + label clicável).
- Garantir que `onCheckedChange` trate explicitamente o tipo `boolean | "indeterminate"`:
  - `const isChecked = checked === true;`
- Adicionar `stopPropagation()` no `Checkbox` (e/ou no item), usando `onClick` e `onPointerDown` para evitar “outside click”.

**Resultado esperado:**
- Selecionar departamento não dispara eventos duplicados
- Não há fechamento inesperado nem overlay preso

### 2) Corrigir o fluxo “Editar permissões” (Settings.tsx) — tornar a interação do checkbox “à prova de modal”
**Mudanças:**
- Trocar a estrutura `label` envolvendo `Checkbox` por uma estrutura consistente e controlada:
  - Ex.: `div` clicável + checkbox com `stopPropagation`
- Garantir o mesmo tratamento de `checked === true`
- (Opcional e bem seguro) Adicionar `onPointerDown={(e)=>e.stopPropagation()}` no container do item + no checkbox para evitar interpretação como clique fora do modal.

### 3) Instrumentação leve para “prova” (sem afetar produção)
- Adicionar logs condicionais (apenas em dev) ou logs minimalistas e temporários para capturar:
  - quando ocorre seleção
  - estado do Dialog (open/close)
  - se algum erro é lançado no clique
- Alternativa mais elegante e segura: um pequeno Error Boundary apenas ao redor da área do dialog de membros (fallback simples em vez de tela vazia), evitando que o usuário fique “travado” caso exista algum erro escondido.

Obs: Se preferir zero logs, podemos pular essa etapa, mas ela ajuda muito a garantir que não exista um erro oculto além dos eventos.

---

## Arquivos que serão modificados
1) `src/components/admin/InviteMemberDialog.tsx`
2) `src/pages/Settings.tsx`
(opcional, só se necessário para diagnóstico) 3) um ErrorBoundary simples em `src/components/...` ou no próprio `Settings.tsx` (local, sem mexer na app toda)

---

## Passo a passo de implementação (sequência)
1. Ajustar `InviteMemberDialog`:
   - Refatorar item de departamento para ter **apenas uma fonte de verdade** do toggle
   - Bloquear bubbling do checkbox (click/pointerdown)
   - Garantir o tratamento de `indeterminate`
2. Ajustar lista de departamentos do Dialog de edição em `Settings.tsx` com a mesma abordagem:
   - item clicável controlado
   - checkbox “isolado” com stopPropagation
3. (Se ainda ocorrer) Adicionar instrumentação mínima ou ErrorBoundary local
4. Revisar visual/UX: manter o layout idêntico, sem mudanças de estilo inesperadas

---

## Checklist de testes (anti-regressão)
### Fluxo A — Convidar membro
1. Ir em **Configurações → Membros**
2. Clicar **Convidar membro**
3. Selecionar **Atendente**
4. Marcar/desmarcar departamentos (vários cliques, rápido e lento)
5. Verificar que:
   - a tela não fica preta
   - o diálogo não fecha sozinho
   - a contagem “X selecionados” atualiza corretamente
6. Enviar convite e confirmar que continua funcionando

### Fluxo B — Editar permissões
1. Em **Membros**, clicar **Editar**
2. Alterar para **Atendente**
3. Marcar/desmarcar departamentos
4. Salvar e validar que:
   - não ocorre tela preta
   - permissões persistem
   - badges na tabela refletem os departamentos

### Smoke test geral
- Navegar entre abas: **Templates**, **Integrações**, **Plano**, **Segurança**
- Verificar que nenhum modal ficou com overlay “preso”

---

## Risco e por que não deve quebrar nada
- Mudanças são **somente de UI/eventos** (stopPropagation + remover duplicidade), sem alterar regras de permissão nem chamadas ao backend.
- Mantém o mesmo estado e as mesmas mutações, apenas evita eventos inesperados que podem travar o modal.
- Plano é incremental: primeiro corrigimos o convite (mais suspeito), depois alinhamos a edição.

---

## Entrega
Após você aprovar este plano, eu implemento as alterações e valido os fluxos A/B no preview, com foco em não gerar regressões.
