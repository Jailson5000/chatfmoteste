
## Aplicar Correcoes Pendentes

### O que sera feito

**1. Configurar o segredo CRON_SECRET**
- Adicionar a variavel `CRON_SECRET` com o valor `df10c830608d54dbc1b84ff5b907280a3dba2f4ba5879ef96bad3feeb5069f53` nos segredos do projeto
- Isso permitira chamar a funcao `sync-evolution-instances` via curl/cron sem precisar de login

**2. Atualizar status das 7 instancias no banco**
- As 7 instancias que a Evolution API mostra como "open" serao atualizadas para "connected"
- Os campos `awaiting_qr`, `disconnected_since` e `reconnect_attempts_count` serao resetados

| Instancia | Status Atual | Novo Status |
|---|---|---|
| inst_ea9bfhx3 | connecting | connected |
| inst_0gkejsc5 | connecting | connected |
| inst_5fjooku6 | connecting | connected |
| inst_464pnw5n | connecting | connected |
| inst_l26f156k | connecting | connected |
| inst_d92ekkep | awaiting_qr | connected |
| inst_n5572v68 | awaiting_qr | connected |

### Resultado
- O painel mostrara as 7 instancias como "Conectado" imediatamente
- Voce podera sincronizar manualmente a qualquer momento com:

```
curl -s -X POST "https://jiragtersejnarxruqyd.supabase.co/functions/v1/sync-evolution-instances" \
  -H "x-cron-secret: df10c830608d54dbc1b84ff5b907280a3dba2f4ba5879ef96bad3feeb5069f53" \
  -H "Content-Type: application/json"
```

### Detalhes Tecnicos

**SQL a ser executado:**
```sql
UPDATE whatsapp_instances
SET 
  status = 'connected',
  awaiting_qr = false,
  manual_disconnect = false,
  disconnected_since = NULL,
  reconnect_attempts_count = 0,
  updated_at = now()
WHERE instance_name IN (
  'inst_ea9bfhx3', 'inst_0gkejsc5', 'inst_5fjooku6',
  'inst_464pnw5n', 'inst_l26f156k', 'inst_d92ekkep', 'inst_n5572v68'
);
```
