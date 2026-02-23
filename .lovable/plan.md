
# Correcao: Instancias Recriadas Pegam Sessao Antiga do Disco

## Diagnostico

Ao deletar instancias via API e recria-las com `global_recreate_instance`, a Evolution API v2.2.3 reutiliza os arquivos de sessao do disco (`/evolution/instances/{instanceName}/session*`). Resultado: a instancia vai direto para "connecting" (tentando reconectar com sessao antiga) em vez de gerar um QR code novo.

A screenshot confirma que `inst_5fjooku6` (que usou `get_qrcode` com recovery Level 2 - logout + connect) gerou QR com sucesso. Ja as instancias recriadas via `global_recreate` nao passam por logout, entao ficam presas.

## Mudancas Tecnicas

### Arquivo: `supabase/functions/evolution-api/index.ts`

**Correcao no `global_recreate_instance` (linhas ~3814-3835):**

Antes de chamar `/instance/create`, adicionar dois passos:
1. Tentar `/instance/logout/{instanceName}` (DELETE) para invalidar a sessao
2. Tentar `/instance/delete/{instanceName}` (DELETE) para remover a instancia e limpar arquivos
3. Aguardar 2 segundos
4. Entao chamar `/instance/create`

```typescript
// Step 0: Clean up any existing instance (logout + delete to clear session files)
console.log(`[Evolution API] global_recreate: Cleaning up existing instance ${body.instanceName}...`);
try {
  await fetchWithTimeout(`${apiUrl}/instance/logout/${body.instanceName}`, {
    method: "DELETE",
    headers: { apikey: globalApiKey },
  }, 5000);
} catch (_) { /* ignore - may not exist */ }

try {
  await fetchWithTimeout(`${apiUrl}/instance/delete/${body.instanceName}`, {
    method: "DELETE",
    headers: { apikey: globalApiKey },
  }, 5000);
} catch (_) { /* ignore - may not exist */ }

await new Promise(resolve => setTimeout(resolve, 2000));

// Step 1: Create instance in Evolution API (original code continues)
```

Isso garante que sessoes antigas sejam limpas antes de recriar a instancia.

### Acao Manual no VPS (Critica)

Os arquivos de sessao das instancias atuais precisam ser limpos manualmente:

```bash
# Parar containers, limpar sessoes, reiniciar
cd /var/www/miauchat  # ou onde esta o docker-compose

# Ver sessoes existentes
docker exec evolution-api ls -la /evolution/instances/

# Remover sessoes corrompidas de TODAS as instancias
docker exec evolution-api rm -rf /evolution/instances/inst_*/

# Reiniciar o container para limpar cache em memoria
docker restart evolution-api

# Aguardar 30 segundos para inicializar
sleep 30

# Verificar que nao ha instancias residuais
curl -s "https://evo.fmoadv.com.br/instance/fetchInstances" \
  -H "apikey: a3c56030f89efe1e5b4c033308c7e3c8f72d7492ac8bb46947be28df2e06ffed"
```

Apos isso, aguardar 5 minutos e usar "Gerar QR Code" em cada empresa.

### Deploy
Redeployar a edge function `evolution-api`.

## Resultado Esperado
1. `global_recreate` faz logout+delete antes de criar, evitando sessoes residuais
2. Apos limpeza do VPS, todas as instancias geram QR codes limpos
3. Sem mais loops de "connecting" causados por sessoes corrompidas
