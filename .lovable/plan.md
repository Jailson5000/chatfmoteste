
Objetivo
- No painel lateral de Conversas (ContactDetailsPanel), permitir selecionar qualquer status/etiqueta/departamento mesmo quando a lista for grande, adicionando rolagem clara e confiável, sem afetar Kanban nem outras áreas.

Diagnóstico (por que acontece)
- O painel lateral já tem rolagem principal (ScrollArea “grande”) e, dentro de “Propriedades”, cada seção (Status/Etiquetas/Departamento) também tem uma área de rolagem própria.
- Hoje, Status e Etiquetas usam `ScrollArea` com `max-h-48` (e Departamento `max-h-[60vh]`). Na prática, isso deixa visível só uma “fatia” (ex.: ~5 itens) e depende de uma rolagem interna que está pouco evidente/instável (principalmente por ser um ScrollArea Radix aninhado dentro de outro ScrollArea).

Solução (mínima e segura)
- Tornar a rolagem dessas listas mais óbvia e garantida, evitando ScrollArea aninhado onde possível.
- Implementar rolagem “nativa” (overflow-y) apenas dentro das listas de Status/Etiquetas/Departamento, mantendo o resto do painel como está. Isso reduz risco de conflitos de scroll entre ScrollAreas.

Mudanças planejadas (código)
1) Ajustar ContactDetailsPanel (arquivo: `src/components/conversations/ContactDetailsPanel.tsx`)
   - Na seção “Status”:
     - Substituir o bloco:
       - `<ScrollArea className="max-h-48"> ... </ScrollArea>`
     - Por um container nativo com altura máxima e rolagem:
       - `div` com `max-h-[60vh] overflow-y-auto pr-2 overscroll-contain` (altura pode ser 60vh para “caber mais” e ainda rolar quando necessário).
     - Manter o conteúdo interno igual (map de `statuses` e botões).
   - Na seção “Etiquetas”:
     - Mesmo ajuste: trocar `ScrollArea` por `div` com `max-h-[60vh] overflow-y-auto pr-2 overscroll-contain`.
   - Na seção “Departamento”:
     - Também trocar o `ScrollArea` por `div` nativo equivalente (ou manter se estiver ok, mas para consistência e evitar o mesmo problema, vamos padronizar as 3).
   - Observação: manteremos toda a lógica (handlers, seleção, logs de atividade, invalidações) intacta — só altera a “caixa” que contém a lista.

2) Garantir que nada “vaze” visualmente
   - Verificar se as listas não ficam “transparentes” e não ficam atrás de outros elementos (aqui não é dropdown/popover, então tende a ser tranquilo).
   - Confirmar que o painel lateral continua com `overflow-x-hidden` e que o `pr-2` evita o scroll sobrepor texto.

3) Ajuste fino de UX (opcional, só se necessário e sem quebrar nada)
   - Se ainda ficar “apertado”, aumentar um pouco a altura máxima:
     - ex.: `max-h-[70vh]` em Status/Etiquetas (mantendo Departamento em 60vh) ou padronizar tudo em 70vh.
   - Se você quiser que “Status” mostre mais itens visíveis sem rolar, podemos aumentar o padding/altura do item ou reduzir espaçamentos — mas isso é opcional.

Arquivos afetados
- `src/components/conversations/ContactDetailsPanel.tsx` (somente ajustes de layout/rolagem nas três listas)

Critérios de aceite (o que vai ficar funcionando)
- No painel lateral:
  - Ao abrir “Propriedades” → “Status”, dá para rolar a lista e selecionar um status que hoje não aparece (ex.: o 10º/11º).
  - Em “Etiquetas”, dá para rolar e selecionar qualquer etiqueta (respeitando o limite de 4).
  - Em “Departamento”, dá para rolar e escolher qualquer departamento.
- Nada muda no Kanban (já está correto) e o cabeçalho de Conversas continua exibindo e atualizando corretamente.

Testes (anti-regressão — obrigatório)
1) Conversas (desktop)
   - Abrir uma conversa com painel lateral.
   - Expandir Status → rolar até o fim → selecionar um status “lá de baixo”.
   - Confirmar que:
     - o badge do status no painel atualiza,
     - o header (Status no topo da conversa) reflete a mudança,
     - ao trocar de conversa e voltar, permanece correto.
2) Etiquetas
   - Expandir Etiquetas → rolar → selecionar 4 etiquetas → confirmar bloqueio da 5ª.
3) Departamento
   - Expandir Departamento → rolar → selecionar um departamento no fim da lista.
4) Teste de rolagem
   - Garantir que a rolagem ocorre dentro da lista (e não “trava” o painel).
5) Teste cross-feature rápido
   - Ir no Kanban e confirmar que nada mudou no comportamento de status/departamentos/etiquetas.

Risco e mitigação
- Risco baixo: alteração apenas de layout/overflow dentro do ContactDetailsPanel.
- Mitigação: manter handlers e dados intactos; somente trocar o container de scroll (evitar mudanças em hooks, queries, realtime ou mutations).
