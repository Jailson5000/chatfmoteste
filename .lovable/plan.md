
Objetivo
- Garantir que as listas de empresas no Dashboard do Global Admin e em /global-admin/companies (aba Aprovadas) exibam todas as empresas e permitam rolagem, sem regressões.

Diagnóstico (causa raiz)
- O componente compartilhado `src/components/ui/scroll-area.tsx` (Radix ScrollArea) define o Viewport com `h-full`.
- Em vários pontos (incluindo os dois que estão quebrados), usamos `ScrollArea` apenas com `max-h-[...]` (sem `h-[...]` ou sem estar em um container com altura explícita).
- Nesse cenário:
  - O `Root` fica com altura “auto” limitada por `max-height`, e tem `overflow-hidden`.
  - O `Viewport` (com `h-full`) acaba não ficando efetivamente limitado pela `max-height` do Root (altura vira “auto”/conteúdo), então não cria um container rolável.
  - Resultado: o conteúdo excedente é cortado pelo `overflow-hidden` do Root e “não tem como rolar” (exatamente o que aparece nas imagens).

Por que isso afeta especificamente Dashboard e Empresas Aprovadas
- `CompanyUsageTable.tsx` usa `<ScrollArea className="max-h-[calc(100vh-480px)]">` (somente max-h).
- `GlobalAdminCompanies.tsx` usa `<ScrollArea className="max-h-[calc(100vh-320px)]">` (somente max-h).
- Sem o Viewport “herdar”/respeitar a altura máxima, o conteúdo é cortado e a rolagem não funciona.

Estratégia de correção (mínima e com menor risco de regressão)
1) Corrigir o comportamento do `ScrollArea` compartilhado para que `max-h-*` funcione como esperado
- Ajustar `src/components/ui/scroll-area.tsx` para que o `Viewport` respeite a `max-height` do Root quando o Root usar `max-h-*`.
- Implementação proposta:
  - Adicionar `max-h-[inherit]` e `min-h-0` no `ScrollAreaPrimitive.Viewport`.
  - Adicionar `min-h-0 min-w-0` também no `ScrollAreaPrimitive.Root` para melhorar comportamento em containers flex (padrão para scroll estável no Tailwind).
- Efeito: qualquer `ScrollArea` com `max-h-*` passa a rolar corretamente, evitando ter que “remendar” página a página.

2) Reajustar os cálculos de altura dos dois pontos críticos (opcional, mas recomendado)
- Mesmo com a rolagem funcionando, hoje o Dashboard pode mostrar poucas linhas visíveis por causa de `calc(100vh-480px)` (mais “apertado” do que o necessário).
- Ajustes recomendados:
  - `src/components/global-admin/CompanyUsageTable.tsx`: trocar para algo menos restritivo, ex.: `max-h-[calc(100vh-320px)]` (ou `-360px`), para aumentar área visível e ainda manter scroll interno.
  - `src/pages/global-admin/GlobalAdminCompanies.tsx`: manter `max-h-[calc(100vh-320px)]` (após o fix do ScrollArea isso já deve funcionar), e só ajustar se ainda ficar apertado em telas menores.
- Observação: esses números podem ser refinados depois, mas o essencial é: com ScrollArea corrigido, a lista não fica mais “inacessível”.

3) Validar que não existe um segundo bloqueio de scroll por CSS
- Confirmar que o container principal do Global Admin (`GlobalAdminLayout`) permanece com `main className="flex-1 overflow-auto ..."` (ele está correto).
- Confirmar que nenhum wrapper adicional está “matando” a rolagem por overflow hidden fora dos lugares necessários.

Arquivos a alterar
- `src/components/ui/scroll-area.tsx` (correção estrutural para max-height funcionar)
- `src/components/global-admin/CompanyUsageTable.tsx` (ajuste fino do max-h para melhorar visibilidade no Dashboard)
- `src/pages/global-admin/GlobalAdminCompanies.tsx` (ajuste fino do max-h se necessário; a correção principal vem do ScrollArea)

Plano de testes (para evitar regressão)
A) Teste end-to-end (obrigatório)
1. Acessar `/global-admin`:
   - Verificar que a tabela “Empresas Ativas” permite rolar até a última empresa.
   - Verificar que nenhuma linha fica “cortada” sem possibilidade de acessar.
   - Verificar que o scroll do painel não “trava” (wheel/trackpad e arraste da barra).
2. Acessar `/global-admin/companies` na aba “Aprovadas”:
   - Verificar que a tabela rola até o final e mostra todas as empresas.
   - Verificar que o cabeçalho não some de forma estranha ao rolar (se o sticky header não funcionar por causa do wrapper da tabela, isso não impede o acesso às empresas; mas vamos observar).

B) Checagem de regressão rápida (importante, pois mexe em componente compartilhado)
- Abrir pelo menos 3 lugares que usam `ScrollArea max-h-*`:
  - Popovers/filters (ex.: filtros de conversas / filtros de kanban).
  - Dialogs com listas longas.
  - Sidebar do Global Admin (que usa `ScrollArea flex-1`).
- Confirmar que continuam rolando como antes e que não surgiram scrollbars “duplos”.

C) (Opcional) Teste automatizado
- Criar um teste Playwright simples que:
  - Abre `/global-admin/companies`,
  - Encontra o container rolável da lista,
  - Faz scroll até o final,
  - Verifica que a última linha fica visível.
- Isso ajuda a evitar que o problema volte no futuro.

Critérios de aceite
- Dashboard: lista “Empresas Ativas” mostra todas as empresas via rolagem (sem cortes inacessíveis).
- Empresas Aprovadas: tabela mostra todas as empresas via rolagem (sem cortes inacessíveis).
- Nenhuma regressão perceptível em scroll/UX em outras áreas que usam `ScrollArea`.
