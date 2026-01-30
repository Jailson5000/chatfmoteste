
Contexto e diagnóstico (com base no que já foi observado)
- O erro agora acontece ao clicar em “Confirmar agendamento” (tela “Seus dados”). O toast exibido é genérico (“Erro ao realizar agendamento. Tente novamente.”), o que indica que o erro real está sendo lançado como objeto (não como Error), e o frontend está descartando `error.message`.
- No banco, a busca de profissionais vinculados por serviço está correta (há vínculos e o RPC de profissionais retorna dados quando testado diretamente).
- Ainda assim, o agendamento falha na criação do registro em `agenda_pro_appointments` no fluxo público.

Hipóteses mais prováveis (e por que)
1) Token inválido no insert (uuid)
- O frontend gera `confirmation_token` manualmente e envia no insert.
- Se `crypto.randomUUID` não estiver disponível em algum navegador/contexto, o fallback atual gera uma string que NÃO é UUID, e o insert falha com “invalid input syntax for type uuid”.
- Como esse erro vem como objeto (PostgrestError), o catch atual mostra a mensagem genérica (bate exatamente com o que você está vendo).
- Solução segura: NÃO enviar `confirmation_token` no insert e deixar o backend gerar via default `gen_random_uuid()`.

2) Insert público sendo bloqueado por política/validação implícita (multi-tenant / consistência)
- Mesmo com política “Public can insert appointments”, ainda é mais robusto centralizar o insert em um RPC “SECURITY DEFINER” que:
  - resolve o tenant pelo `slug`,
  - valida que o serviço é público/ativo e pertence ao mesmo tenant,
  - valida que o profissional está ativo e vinculado ao serviço,
  - insere o agendamento com `source='public_booking'`,
  - retorna `id` e `confirmation_token`.
- Isso também fortalece as regras de tenant/IDOR e evita discrepâncias entre domínios/subdomínios.

Objetivo do patch
- Fazer o agendamento público funcionar em:
  - https://miau-test-h99u.miauchat.com.br/agendar/agenda
  - https://suporte.miauchat.com.br/agendar/estetica
- Corrigir sem regressão (não quebrar Agenda Pro interna, nem outros módulos), e reforçar isolamento por tenant no fluxo público.

Plano de implementação (sequência com risco mínimo)

Fase 1 — Tornar o erro visível e corrigir a causa mais provável (rápido e seguro)
1) Frontend: melhorar a mensagem de erro do “Confirmar agendamento”
- Ajustar o catch do `handleSubmitBooking` para extrair mensagens de erros “não-Error”:
  - `code`, `message`, `details`, `hint`
- Mostrar ao usuário uma mensagem amigável, mas registrar no console um objeto completo para diagnóstico.
- Resultado: se ainda houver falha, você verá exatamente “por quê” (ex.: uuid inválido, RLS, FK, etc.), sem depender de tentativa e erro.

2) Frontend: parar de enviar `confirmation_token`
- Remover a geração do token no frontend e NÃO enviar `confirmation_token` no insert.
- Alterar `.select("id")` para `.select("id, confirmation_token")` (ou pelo menos `id`) e usar o token gerado pelo backend quando precisar criar links/templates.
- Isso elimina a classe inteira de falhas por UUID inválido e reduz superfície de bugs.

3) Frontend: corrigir o “stale state” na checagem `professionalsError`
- Hoje a checagem `if (!professionalsError)` logo após o `await loadProfessionalsForService()` pode usar um estado antigo (React state é assíncrono).
- Alterar `loadProfessionalsForService` para retornar `{ profs, errorMessage }` e tomar decisões com base no retorno (não no estado).
- Isso evita avançar/bloquear fluxo por motivo errado e melhora previsibilidade.

Fase 2 — Fix definitivo com regras de tenant e sem depender de INSERT direto (robusto)
4) Backend (migration): criar RPC de criação do agendamento público (SECURITY DEFINER)
Criar `public.create_public_booking_appointment(...)` com parâmetros mínimos:
- `public_slug text`
- `service_id uuid`
- `professional_id uuid default null`
- `start_time timestamptz`
- `client_name text`
- `client_phone text`
- `client_email text default null`
- `notes text default null`

Regras dentro do RPC:
- Resolver `law_firm_id` a partir de `agenda_pro_settings.public_slug = public_slug` e exigir:
  - `is_enabled = true`
  - `public_booking_enabled = true`
- Validar serviço:
  - pertence ao `law_firm_id`
  - `is_active = true` e `is_public = true`
- Validar profissional:
  - se `professional_id` vier:
    - pertence ao `law_firm_id`, `is_active = true`,
    - e está vinculado ao serviço em `agenda_pro_service_professionals`
  - se `professional_id` não vier:
    - escolher determinísticamente um profissional vinculado ativo (ex.: menor `position`/`name`)
- Inserir em `agenda_pro_appointments`:
  - `source = 'public_booking'`
  - `status = 'scheduled'`
  - `confirmation_token` sem enviar (deixa default)
- Retornar `appointment_id` e `confirmation_token` (e opcionalmente `professional_id` efetivo).
- Conceder `EXECUTE` para `anon`/`authenticated`.

Por que isso reduz regressão e melhora tenant:
- O insert público deixa de depender de “insert direto” do client (que é sensível a RLS e inconsistências).
- Toda validação de consistência e isolamento fica centralizada no backend.
- Evita que alguém injete um `service_id` de outro tenant ou um `professional_id` não vinculado.

5) Frontend: usar o RPC para criar o agendamento (substituir insert direto)
- No `handleSubmitBooking`, trocar:
  - `.from("agenda_pro_appointments").insert(...)`
  por:
  - `supabase.rpc("create_public_booking_appointment", {...})`
- Passar `slug` em vez de `lawFirmId` (isso reforça a regra de tenant e simplifica).
- Usar `professional_id` selecionado, ou null quando “Sem preferência”.
- A partir do retorno, seguir com:
  - criação de mensagens agendadas (se continuar no client) ou manter como está.
  - chamada de notificação (`agenda-pro-notification`) com `appointment_id`.

Fase 3 — Validação end-to-end (obrigatória por ser mudança crítica)
6) Testes manuais guiados (publicado e preview)
- Em cada URL:
  1. Selecionar “Análise” e “Consulta”
  2. Selecionar um profissional específico e também “Sem preferência”
  3. Selecionar data/hora
  4. Preencher dados e confirmar
  5. Confirmar que:
     - o agendamento é criado
     - `professional_id` não fica vazio quando deveria existir
     - o toast final é sucesso
- Verificar que não houve regressão no painel interno (criação manual de agendamento ainda funciona).

7) (Opcional, mas recomendado) Teste automatizado Playwright
- Criar um teste E2E simples para `/agendar/:slug` que percorra o fluxo e confirme que a confirmação acontece (sem precisar validar envio de mensagens).

Notas importantes de segurança / tenant
- O RPC de criação via `public_slug` evita IDOR por `law_firm_id` conhecido.
- Validações internas garantem consistência: profissional ativo + vinculado ao serviço + tenant correto.
- Não expor PII em RPCs públicos (só dados mínimos necessários).

Arquivos/áreas que serão alteradas quando você pedir para executar
- `src/pages/PublicBooking.tsx`
  - melhorar erro, remover envio de `confirmation_token`, corrigir stale state, usar novo RPC de criação
- `supabase/migrations/<nova_migration>.sql` (backend)
  - criar/ajustar RPC `create_public_booking_appointment`
  - grants de execução
- (Se necessário) pequenos ajustes em templates/links usando `confirmation_token` retornado.

Critério de sucesso
- Agendamentos públicos confirmam com sucesso nos dois slugs.
- Sem regressões no fluxo interno.
- Mensagens de erro passam a revelar a causa real (se algum outro bloqueio existir), facilitando manutenção rápida futura.
