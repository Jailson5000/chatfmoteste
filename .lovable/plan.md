## Status: ✅ Implementado - Aguardando Publicação

### Mudanças Realizadas

1. **Backend (Migration)**: Criado RPC `create_public_booking_appointment` com SECURITY DEFINER
   - Valida tenant via `public_slug` (evita IDOR)
   - Valida serviço ativo + público do mesmo tenant
   - Valida ou seleciona profissional vinculado ao serviço
   - Insere com `source='public_booking'` e token gerado pelo backend
   - Retorna `appointment_id`, `confirmation_token`, `professional_id`

2. **Frontend (PublicBooking.tsx)**: Substituído insert direto por chamada RPC
   - Remove geração de `confirmation_token` no frontend
   - Usa `slug` em vez de `lawFirmId` para identificação de tenant
   - Melhor tratamento de erros com mensagens detalhadas
   - RPC seleciona profissional automaticamente quando não especificado

### Próximos Passos
- **Publicar** para aplicar no ambiente de produção
- Testar nos dois links:
  - https://miau-test-h99u.miauchat.com.br/agendar/agenda
  - https://suporte.miauchat.com.br/agendar/estetica
