
# Correcao: Level 2 Recovery com Delete+Recreate para Limpar Sessoes

## Problema Atual

As instancias estao presas em "connecting" na Evolution API porque os arquivos de sessao no disco do container estao corrompidos. O fluxo atual de recuperacao (Level 2) faz apenas logout + connect, mas isso nao remove os arquivos de sessao do disco. Resultado: a Evolution API tenta reconectar usando a sessao antiga e nunca gera QR code novo.

Os logs confirmam: `inst_5fjooku6` gerou QR com sucesso (provavelmente porque sua sessao estava limpa), mas as outras instancias ficam retornando `{"count":0}` sem QR.

## Solucao

Transformar o Level 2 recovery de "logout + connect" para "logout + delete + create + connect". O `delete` forca a Evolution API a remover os arquivos de sessao do disco. O `create` recria a instancia limpa. O `connect` gera o QR code.

Isso elimina a necessidade de limpeza manual no VPS (docker exec rm -rf).

## Mudancas Tecnicas

### Arquivo: `supabase/functions/evolution-api/index.ts`

**Linhas 1306-1352** - Substituir o Level 2 recovery:

Antes:
```
Level 2: logout -> wait 3s -> connect (2 tentativas)
```

Depois:
```
Level 2: logout -> delete -> wait 3s -> create (com webhook+settings) -> wait 2s -> connect (2 tentativas)
```

Detalhes:
1. Manter o logout existente (linha 1312-1320)
2. Adicionar `DELETE /instance/delete/{instanceName}` apos o logout para forcar remocao dos arquivos de sessao
3. Manter o delay de 3s (linha 1322)
4. Adicionar `POST /instance/create` com `instanceName`, `qrcode: true`, `integration: "WHATSAPP-BAILEYS"` e webhook config - extrair QR se retornar inline
5. Adicionar `POST /settings/set/{instanceName}` com `groupsIgnore: true`
6. Adicionar `POST /webhook/set/{instanceName}` para reconfigurar webhook
7. Se o create retornar QR inline, retornar imediatamente (sem precisar do connect)
8. Caso contrario, aguardar 2s e fazer as 2 tentativas de connect normais

### Deploy
Redeployar a edge function `evolution-api`.

### Acao Manual no VPS (Opcional mas Recomendada)

Para resolver imediatamente as 7 instancias que estao travadas agora, o ideal e limpar o VPS:

```bash
docker exec evolution-api rm -rf /evolution/instances/inst_*/
docker restart evolution-api
```

Aguardar 30 segundos, depois clicar "Gerar QR Code" em cada empresa.

Se nao quiser mexer no VPS, basta clicar "Gerar QR Code" apos o deploy - o novo Level 2 vai fazer o delete+create automaticamente e deve gerar o QR.

## Resultado Esperado

- Level 2 recovery limpa completamente a sessao corrompida via API (sem necessidade de acesso ao VPS)
- QR code gerado com sucesso apos o delete+create
- Limite de 2 tentativas mantido no auto-reconnect para nao bloquear no WhatsApp
