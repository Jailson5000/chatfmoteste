

# Correcao: Instancias em Loop Causando Bloqueio do WhatsApp

## Diagnostico

O problema principal e que as instancias na Evolution API ficam tentando reconectar automaticamente ao WhatsApp a cada 1-2 segundos. Com 7 instancias + 1 fantasma (`inst_a7n22orl`), sao ~14 webhooks/segundo chegando no sistema, e dezenas de tentativas de conexao por minuto ao WhatsApp. O WhatsApp detecta essa atividade repetitiva e bloqueia temporariamente, mostrando "tente mais tarde" ao escanear o QR.

## Causa Raiz

1. **Instancias orfas na Evolution API** - As instancias foram deletadas anteriormente, mas a Evolution API as recriou automaticamente ou a exclusao nao foi efetiva. Elas continuam tentando reconectar ao WhatsApp em loop infinito.
2. **`inst_a7n22orl` fantasma** - Deletada do banco de dados mas ainda ativa na Evolution API, gerando erros PGRST116 a cada segundo.
3. **Threshold de saude muito agressivo** - O health check marca como "Instavel" acima de 3000ms, mas com 7+ instancias em loop, a resposta naturalmente demora mais.

## Solucao em 2 Partes

### Parte 1: Ajustar Health Check (Codigo)

**Arquivo:** `supabase/functions/evolution-health/index.ts`

- **Linha 43**: Aumentar `EVOLUTION_TIMEOUT_MS` de `10000` para `15000`
- **Linha 161**: Aumentar threshold de latencia de `3000` para `5000`

Isso evita falsos alarmes de "Instavel" quando o servidor esta sob carga normal.

### Parte 2: Limpeza Manual das Instancias (VPS)

Essa e a acao mais critica. Todas as instancias precisam ser deletadas da Evolution API para parar o loop de reconexao. Apos a limpeza, aguardar 5+ minutos para o rate limit do WhatsApp expirar, e so entao gerar novos QR codes.

Comandos para executar no VPS:

```bash
# 1. Verificar quais instancias existem na Evolution API
curl -s "https://evo.fmoadv.com.br/instance/fetchInstances" \
  -H "apikey: a3c56030f89efe1e5b4c033308c7e3c8f72d7492ac8bb46947be28df2e06ffed" | jq '.[].instance.instanceName'

# 2. Deletar TODAS as instancias para parar o loop
for inst in inst_a7n22orl inst_l26f156k inst_s10r2qh8 inst_464pnw5n inst_d92ekkep inst_0gkejsc5 inst_5fjooku6 inst_ea9bfhx3; do
  echo "Deleting $inst..."
  curl -s -X DELETE "https://evo.fmoadv.com.br/instance/delete/$inst" \
    -H "apikey: a3c56030f89efe1e5b4c033308c7e3c8f72d7492ac8bb46947be28df2e06ffed"
  echo ""
done

# 3. Confirmar que nao sobrou nenhuma
curl -s "https://evo.fmoadv.com.br/instance/fetchInstances" \
  -H "apikey: a3c56030f89efe1e5b4c033308c7e3c8f72d7492ac8bb46947be28df2e06ffed" | jq '.[].instance.instanceName'
```

### Apos a Limpeza

1. Aguardar **5 minutos** (rate limit do WhatsApp)
2. Ir em cada empresa no painel e clicar **"Gerar QR Code"**
3. A edge function vai recriar a instancia na Evolution API com sessao limpa
4. Escanear o QR imediatamente (expira em ~40s)

## Resultado Esperado

- Health check mostrara "Online" para latencias ate 5 segundos
- Sem mais webhooks em loop apos deletar as instancias
- WhatsApp permitira novas conexoes apos o periodo de espera
- QR codes serao gerados com sucesso

