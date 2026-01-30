
Contexto (o que está acontecendo)
- No agendamento público (/agendar/:slug), ao escolher um serviço, aparece “Este serviço não possui profissionais disponíveis…”, mesmo existindo profissionais ativos e vinculados ao serviço.
- Isso está acontecendo em todos os links/empresas que você testou, no ambiente publicado, e você já publicou as mudanças.

Reformulando o problema real
- O sistema NÃO está encontrando profissionais para o serviço no agendamento público porque a chamada que busca “profissionais do serviço” está falhando no backend (erro de função), e o frontend está tratando esse erro como “lista vazia”, exibindo a mensagem errada (“não possui profissionais”).

Do I know what the issue is?
- Sim.
- Identifiquei um erro específico e reproduzível no backend: a função `public.get_public_professionals_for_booking(_law_firm_id, _service_id)` quebra com:
  - `ERROR: column reference "id" is ambiguous`
- Causa técnica: a função retorna `RETURNS TABLE (id uuid, ...)`, e em PL/pgSQL isso cria variáveis OUT com nomes iguais às colunas. Dentro da validação do serviço existe um `WHERE id = _service_id` sem alias, e o Postgres fica em dúvida entre:
  - `id` (variável de retorno da função)
  - `agenda_pro_services.id` (coluna da tabela)
- Resultado: o RPC falha quando `_service_id` é enviado, então o frontend recebe `error` e acaba mostrando “sem profissionais” (mensagem incorreta).

Evidências (confirmadas no backend)
- A função funciona quando chamada sem `_service_id` (retorna profissionais do escritório).
- A função falha quando chamada com `_service_id`, gerando o erro “id is ambiguous”.
- Existem vínculos válidos em `agenda_pro_service_professionals` (ex.: 2 profissionais vinculados ao serviço), então não é problema de configuração.

Plano de correção (sem regressões)

1) Corrigir definitivamente a função do backend (migração)
Objetivo: fazer o RPC funcionar quando `_service_id` for informado.
Ação:
- Criar uma nova migration que faça `CREATE OR REPLACE FUNCTION public.get_public_professionals_for_booking(...)` corrigindo as referências ambíguas.
- Trocar todas as referências não qualificadas `id` dentro da função por referências qualificadas com alias.
  Exemplo (ponto do bug):
  - Antes: `WHERE id = _service_id`
  - Depois: `FROM public.agenda_pro_services s WHERE s.id = _service_id`
- Revisar também qualquer outro ponto com risco de conflito de nomes (boas práticas: sempre usar aliases: `s.`, `p.`, `sp.`).
- Reaplicar `GRANT EXECUTE` para `anon` e `authenticated` na assinatura correta (por segurança, mesmo que já exista).
- Manter a função retornando apenas campos “públicos” (id, name, specialty, avatar_url) para não expor PII.

Checklist SQL (o que a migration deve conter)
- `CREATE OR REPLACE FUNCTION ... RETURNS TABLE (id uuid, name text, specialty text, avatar_url text) ...`
- Validar agenda pública habilitada via `agenda_pro_settings`.
- Validar serviço com alias `s`:
  - `IF NOT EXISTS (SELECT 1 FROM public.agenda_pro_services s WHERE s.id = _service_id AND s.law_firm_id = _law_firm_id AND s.is_active = true AND s.is_public = true) THEN RETURN; END IF;`
- Query principal com aliases:
  - `FROM public.agenda_pro_professionals p`
  - `JOIN public.agenda_pro_service_professionals sp ON sp.professional_id = p.id`
  - `WHERE sp.service_id = _service_id AND p.law_firm_id = _law_firm_id AND p.is_active = true`
- `GRANT EXECUTE ON FUNCTION public.get_public_professionals_for_booking(uuid, uuid) TO anon;`
- `GRANT EXECUTE ON FUNCTION public.get_public_professionals_for_booking(uuid, uuid) TO authenticated;`

2) Ajustar o frontend para não mascarar erro como “sem profissionais”
Objetivo: se o RPC falhar, o usuário deve ver “erro ao carregar” (e não “serviço sem profissionais”).
Ação no `src/pages/PublicBooking.tsx`:
- Alterar a lógica do clique no serviço para diferenciar:
  - Caso A: RPC retornou erro -> mostrar uma mensagem de erro (“Não foi possível carregar os profissionais. Tente novamente.”)
  - Caso B: RPC retornou com sucesso e lista vazia -> mostrar “Este serviço não possui profissionais disponíveis…”
Opções seguras de implementação:
- Opção recomendada (mínima e clara):
  - Fazer `loadProfessionalsForService` retornar um objeto `{ profs, ok }` ou `{ profs, errorMessage }`.
  - No `onClick`, se `errorMessage` existir, exibir essa mensagem e bloquear avanço.
- Ajuste adicional recomendado:
  - Se `professionalsError` estiver preenchido, não mostrar a mensagem de “sem profissionais”; mostrar a mensagem do erro e/ou um botão “Tentar novamente”.

3) Testes e validação (end-to-end, sem quebrar o projeto)
Backend (validação direta)
- Executar `SELECT * FROM public.get_public_professionals_for_booking(<law_firm_id>, <service_id>);` e confirmar que retorna os profissionais vinculados.
- Executar `SELECT * FROM public.get_public_professionals_for_booking(<law_firm_id>, NULL);` e confirmar que retorna os profissionais ativos.

Frontend (fluxo público)
- Abrir os links públicos (ex.: /agendar/agenda e /agendar/estetica):
  1. Carrega serviços
  2. Clicar no serviço “Consulta”
  3. Deve avançar para seleção de profissional ou direto para data/hora (se 1)
  4. Selecionar data e horário
  5. Preencher dados e confirmar agendamento
  6. Confirmar que o agendamento é criado (sem erro de profissional)
- Caso negativo: criar/usar um serviço sem profissionais vinculados e confirmar que o sistema bloqueia com mensagem correta.

Risco de regressão e mitigação
- Risco: baixo, pois a correção principal é local (só qualificação de colunas na função) e não altera regras de negócio nem RLS.
- Mitigação:
  - Manter exatamente os mesmos filtros atuais (is_enabled/public_booking_enabled/is_public/is_active).
  - Alterar apenas o necessário no frontend para melhorar a mensagem e não mudar o fluxo quando estiver tudo ok.

Arquivos/áreas envolvidas
- Backend: nova migration em `supabase/migrations/...sql` corrigindo `get_public_professionals_for_booking`
- Frontend: `src/pages/PublicBooking.tsx` (melhorar distinção entre “erro de carregamento” vs “lista vazia”)

Resultado esperado
- Ao selecionar um serviço no agendamento público, os profissionais vinculados passam a aparecer/ser selecionados corretamente.
- O erro “não possui profissionais” só aparece quando realmente não houver profissionais vinculados/ativos; em caso de falha técnica, a UI mostra um erro correto e permite tentar novamente.
