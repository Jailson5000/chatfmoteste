
Objetivo
- Corrigir definitivamente o erro “Nenhum profissional disponível para este serviço” no agendamento público (/agendar/:slug), mesmo quando há profissionais cadastrados e vinculados ao serviço.
- Fazer isso sem quebrar o projeto, mantendo fallback seguro e adicionando validações para evitar o usuário avançar até a confirmação com estado inconsistente.

Diagnóstico (com base no comportamento e no diff)
- O erro acontece no submit (clique em “Confirmar agendamento”), quando o código tenta resolver um professional_id e não encontra nenhum:
  - selectedProfessional?.id || serviceProfessionals[0]?.id || professionals[0]?.id
- Como o usuário consegue avançar até a etapa “Seus dados”, isso indica que a UI está permitindo o fluxo mesmo com lista de profissionais vazia (professionals e serviceProfessionals).
- A causa mais provável é que a busca de profissionais no agendamento público está retornando vazio (ou com erro silencioso), por exemplo:
  - Falta de permissão para leitura pública na “view segura” usada no público (agenda_pro_professionals_public), ou
  - A view está sendo afetada por regras de acesso (RLS) e, como o usuário do público não está autenticado, retorna 0 linhas.
- Hoje o código não verifica “error” na query dos profissionais. Se houver “permission denied”/bloqueio, a página continua e só falha no final.

Estratégia de correção (robusta e segura)
Vamos corrigir em 2 camadas: (A) backend/dados e (B) frontend/fluxo.

A) Backend/Dados (fix principal)
1) Confirmar por que o público está recebendo 0 profissionais
   - Validar se o agendamento público consegue fazer SELECT na fonte de dados “pública” de profissionais.
   - Se houver erro de permissão/RLS, isso explica exatamente o comportamento atual (lista vazia e erro somente no submit).

2) Tornar a leitura pública de profissionais “determinística” e segura
   Vamos adotar o caminho mais seguro e resistente a mudanças de política:

   Opção A (preferida, mínima e compatível com o que já existe)
   - Ajustar a fonte pública de profissionais para que seja consultável pelo público e continue sem PII (apenas id, nome, specialty, avatar_url etc.).
   - Garantir que:
     - a view pública (agenda_pro_professionals_public) possa ser lida pelo público (GRANT SELECT para o papel de acesso público)
     - e que ela não fique “presa” em RLS do table base (dependendo da configuração atual).

   Opção B (fallback se a Opção A não resolver por conta de RLS forçada)
   - Criar uma função de banco “SECURITY DEFINER” para retornar profissionais públicos de forma segura:
     - Ex.: get_public_professionals_by_law_firm(_law_firm_id uuid)
     - ou get_public_professionals_by_service(_service_id uuid)
   - A função valida:
     - agenda_pro_settings.public_booking_enabled = true para o tenant
     - profissionais is_active = true
     - (se por serviço) serviço is_public/is_active e vínculo na agenda_pro_service_professionals
   - Retorna somente campos seguros (sem e-mail/telefone/documentos).
   - O frontend passa a chamar essa função (rpc) em vez de ler diretamente a view.

   Critério de decisão
   - Se der para garantir leitura pública via view sem expor PII e sem depender de RLS do table base, fazemos Opção A.
   - Se houver qualquer risco de exposição ou se RLS estiver “forçada” e impedir a view, aplicamos Opção B (mais estável).

3) Migração
- Implementar a mudança no backend via migration (sem mexer em schemas reservados).
- Incluir comentários e manter compatibilidade com o que já está em produção.

B) Frontend/Fluxo (evitar falha tardia e melhorar UX)
1) Tratar erro/resultado vazio ao carregar profissionais
- Em src/pages/PublicBooking.tsx:
  - Capturar o “error” da query (ou da rpc) de profissionais.
  - Se falhar:
    - exibir mensagem clara: “Não foi possível carregar os profissionais para agendamento. Tente novamente em instantes.”
    - impedir avançar para as próximas etapas (ou manter a tela em estado de erro com botão “Recarregar”).
  - Se vier vazio:
    - exibir mensagem clara: “Este serviço não possui profissionais disponíveis no agendamento online. Fale com a empresa.”

2) Regras para avançar de etapa (bloqueio preventivo)
- Ao selecionar serviço:
  - calcular filteredProfs
  - se filteredProfs.length === 0:
    - não permitir seguir para datetime/info
    - mostrar aviso na própria tela (não só toast), explicando que não há profissionais vinculados/publicados
- Ao selecionar horário:
  - validar novamente se existe professionalId resolvível
  - se não existir, travar avanço e pedir para voltar.

3) Resolver “professional_name” em mensagens
- Hoje, em alguns pontos (ex.: template de mensagens), o nome do profissional pode cair em “Profissional” se selectedProfessional estiver null.
- Ajustar para usar:
  - selectedProfessional?.name || serviceProfessionals[0]?.name || professionals[0]?.name || "Profissional"
- Isso evita mensagens inconsistentes quando o fluxo auto-seleciona.

4) Instrumentação leve (temporária) para fechar diagnóstico
- Adicionar logs (console.warn) no público somente quando:
  - services carregaram, mas professionals vieram 0
  - e capturar o error message/código quando existir
- Objetivo: se o problema persistir, fica claro se é permissão/RLS ou dado.

Sequência de implementação (para minimizar risco)
1) Reproduzir e confirmar a causa exata (na URL pública e também no Preview)
2) Implementar correção no backend (Opção A; se falhar, Opção B)
3) Atualizar o frontend para:
   - usar a fonte correta de profissionais (view ajustada ou rpc)
   - adicionar validações de avanço e tratamento de erro
4) Testes end-to-end
   - Abrir /agendar/agenda
   - Escolher “Análise”
   - Ver lista de profissionais (ou auto-seleção se 1)
   - Escolher data/hora
   - Preencher dados
   - Confirmar agendamento sem erro
   - Confirmar que o registro foi criado com professional_id preenchido
   - Testar também um serviço sem vínculo (se existir) e validar que o sistema bloqueia corretamente com mensagem amigável

Arquivos/áreas envolvidas
- Frontend:
  - src/pages/PublicBooking.tsx (tratamento de erro, validações, e ajuste da origem dos profissionais)
- Backend (migração):
  - Ajuste de permissões/segurança para leitura pública de profissionais (via view) OU criação de função segura para consulta pública

Riscos e mitigação
- Risco: liberar leitura pública indevida (PII)
  - Mitigação: não abrir SELECT na tabela “agenda_pro_professionals” diretamente para público; manter acesso público apenas via view/func retornando campos seguros.
- Risco: corrigir apenas UI e continuar com lista vazia por permissão
  - Mitigação: corrigir backend primeiro (ou em conjunto) e adicionar tratamento de erro no frontend para não falhar só no submit.
- Risco: diferença entre ambientes (preview vs domínio publicado)
  - Mitigação: validar nos dois, e publicar após confirmar o fix no Preview.

Critério de sucesso
- O agendamento público permite selecionar serviço e concluir o agendamento com professional_id preenchido quando há profissionais vinculados e ativos.
- Se não houver profissionais vinculados, o sistema informa claramente e não permite avançar até o submit.
- Nenhum dado sensível de profissionais é exposto publicamente.
