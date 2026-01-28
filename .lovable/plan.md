
## Situação atual (reformulando o erro)
- O erro é crítico e **acontece somente no modal “Convidar membro”**.
- **Clicar no checkbox (quadradinho vermelho) funciona**.
- **Clicar no nome do departamento (texto) causa “tela preta” imediatamente**.
- No modal de **editar membros existentes**, clicar no texto funciona — então o problema está isolado no fluxo de convite.

## O que eu verifiquei no código (onde o problema pode estar)
Arquivo atual: `src/components/admin/InviteMemberDialog.tsx`

1) **O `Dialog` está com `onOpenChange={handleClose}`**
- Hoje está assim:
  ```tsx
  <Dialog open={open} onOpenChange={handleClose}>
  ```
- `handleClose()` ignora o booleano do Radix (`true/false`) e sempre reseta tudo + fecha o modal.
- Isso é diferente do fluxo de edição (em `Settings.tsx`), que usa:
  ```tsx
  onOpenChange={(open) => { if (!open) setEditingMember(null); }}
  ```
- Esse detalhe pode causar comportamento instável quando o Radix tenta gerenciar “dismiss”/foco.

2) **Eventos “outside click” do Radix podem estar disparando ao clicar no texto**
- O Radix Dialog fecha quando ele acha que houve interação “fora” do conteúdo (pointer/focus outside).
- `stopPropagation()` em `onClick`/`onPointerDown` nem sempre impede isso, porque o Radix usa handlers próprios e pode detectar “outside” antes do seu handler.
- Resultado típico: modal tenta fechar e pode sobrar apenas o overlay escuro (percepção de “tela preta”).

## Do I know what the issue is?
Tenho uma hipótese forte e consistente com o sintoma “só texto quebra, checkbox não”: **o clique no texto está sendo interpretado pelo Dialog como interação externa (dismiss)**, e isso combinado com `onOpenChange={handleClose}` (que sempre reseta/fecha) torna o fechamento instável no convite.

## Correção proposta (sem quebrar nada e isolada no modal de convite)
Vamos fazer uma correção “à prova de Radix” em 3 frentes, todas apenas no `InviteMemberDialog`:

### A) Corrigir o `onOpenChange` do Dialog (não ignorar o boolean)
- Substituir:
  ```tsx
  <Dialog open={open} onOpenChange={handleClose}>
  ```
- Por um handler que:
  - **só reseta o formulário quando estiver fechando**
  - **respeita o boolean** vindo do Radix
- Exemplo de estrutura:
  - `resetForm()` (apenas reseta estados locais)
  - `handleDialogOpenChange(nextOpen: boolean)`:
    - se `nextOpen === false`: `resetForm(); onOpenChange(false)`
    - se `nextOpen === true`: `onOpenChange(true)`

Isso alinha o comportamento com o modal de edição (que funciona).

### B) Bloquear “dismiss” incorreto quando o clique acontece dentro da lista de departamentos
Adicionar um `ref` no container da lista de departamentos:
- `const deptListRef = useRef<HTMLDivElement>(null);`
- `ref={deptListRef}` no `<div className="h-[150px] ...">`

E no `<DialogContent />`, adicionar:
- `onInteractOutside={(event) => { ... }}`
- `onPointerDownOutside={(event) => { ... }}` (reforço)

Lógica:
- Se o `event.target` (ou `event.detail.originalEvent.target`) estiver **dentro** do `deptListRef.current`, então:
  - `event.preventDefault()` para impedir o Dialog de fechar por engano.

Isso mantém:
- clique no texto -> funciona e não fecha o modal
- clique fora do modal -> continua fechando normalmente (porque não será “dentro” do ref)

### C) Tornar a linha inteira “clicável” de forma segura dentro do `<form>`
Para não existir nenhum risco de “submit” ou comportamento estranho dentro de form:
- Trocar a linha do departamento para um elemento semanticamente clicável:
  - opção 1 (mais simples): manter `<div>` mas remover `e.preventDefault()` do `onClick` (não é necessário aqui)
  - opção 2 (mais robusta): transformar a linha em `<button type="button">...</button>`
- Garantir também que o `Checkbox` dentro do form sempre seja `type="button"`:
  ```tsx
  <Checkbox type="button" ... />
  ```
Isso é totalmente local ao modal de convite, reduz chance de efeitos colaterais.

## Arquivo a alterar
- `src/components/admin/InviteMemberDialog.tsx` (somente)

## Sequência de implementação
1) Refatorar `handleClose` em:
   - `resetForm()`
   - `handleDialogOpenChange(nextOpen: boolean)`
2) Adicionar `deptListRef` e plugar no container da lista.
3) Adicionar em `DialogContent`:
   - `onInteractOutside` com `preventDefault` quando `target` estiver dentro do `deptListRef`
   - `onPointerDownOutside` com a mesma regra (redundância intencional para garantir estabilidade)
4) Ajustar o item de departamento para aceitar clique no texto/bolinha com segurança:
   - manter `onClick` no container/linha para toggle
   - remover `preventDefault()` se não for mais necessário
   - passar `type="button"` no `Checkbox` do convite
5) Se ainda houver qualquer “tela preta”:
   - adicionar um Error Boundary local (somente envolvendo o conteúdo do modal) para capturar erro runtime e logar a stack, sem derrubar a tela.

## Checklist de testes (obrigatório para evitar regressão)
### Fluxo A (o que está quebrando)
1) Configurações → Membros → Convidar membro
2) Selecionar perfil “Atendente”
3) Testar clique em:
   - checkbox (quadrado vermelho)
   - nome do departamento (texto)
   - bolinha colorida
   - área vazia da linha
4) Confirmar:
   - não aparece “tela preta”
   - o modal não fecha sozinho
   - o contador “X selecionados” atualiza

### Fluxo B (não pode regredir)
1) Editar membro existente → Atendente → clicar no texto e marcar/desmarcar
2) Salvar e confirmar que persistiu.

## Por que isso é seguro (sem quebrar nada)
- Alteração fica restrita ao **InviteMemberDialog**, sem mexer em hooks, backend, nem no fluxo de edição que já está OK.
- A correção usa a própria API prevista pelo Radix (`onInteractOutside/onPointerDownOutside`) para resolver “dismiss” indevido.
- Mantém o comportamento esperado: clicar no texto seleciona, clicar fora fecha, e não há múltiplos overlays nem travamentos.
