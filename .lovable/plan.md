

# Correcao: QR Code nao gerado apos recreate de instancia

## Problema Confirmado nos Logs

Os logs de 16:45-16:46 mostram o fluxo exato do bug:

```text
16:45:59 - Connect retorna 404 (instancia nao existe na Evolution)
16:45:59 - Recreate executado com sucesso
16:46:06 - Connect pos-recreate retorna {"count":0} (delay de apenas 1s)
16:46:06 - Entra no fluxo de "corrupted session"
16:46:12 - Logout+Connect: tambem retorna {"count":0}
16:46:34 - Delete+Recreate: Fresh QR attempt 1 retorna {"count":0}
16:46:37 - Fresh QR attempt 2: {"count":0}
16:46:42 - FALHA FINAL
```

## Causa Raiz

Dois problemas combinados:

1. **Delay insuficiente apos recreate**: Apos criar a instancia na Evolution API, o codigo espera apenas **1 segundo** (linha 793) antes de chamar `/instance/connect`. O Baileys v7 precisa de mais tempo para inicializar a sessao internamente.

2. **Duplo recovery desnecessario**: Quando o connect pos-recreate retorna `{"count":0}`, o codigo cai no bloco de "corrupted session" (linha 866-1127), que faz **outro ciclo completo** de logout+delete+recreate - agora em cima de uma instancia recem-criada que so precisava de mais tempo.

## Solucao

### Alteracao no arquivo: `supabase/functions/evolution-api/index.ts`

#### 1. Aumentar delay apos recreate no bloco 404 (linha 793)

Mudar de 1s para **5 segundos** o tempo de espera apos o create, e adicionar **retry com delay progressivo** para o connect pos-recreate.

Em vez de:
```text
wait 1s -> connect (unica tentativa)
```

Fazer:
```text
wait 5s -> connect
  -> Se QR: sucesso, retornar direto
  -> Se {"count":0}: wait 5s -> connect (2a tentativa)
    -> Se QR: sucesso
    -> Se {"count":0}: retornar erro claro pedindo para aguardar
```

#### 2. Evitar cascata para corrupted session apos recreate

Apos o bloco de recreate do 404 (que termina na linha 840), se o connect pos-recreate retornou `{"count":0}`, **nao deixar cair no bloco de corrupted session**. Em vez disso, retornar uma resposta informativa pedindo ao usuario para tentar novamente em 30 segundos, pois a instancia foi recriada com sucesso mas o Baileys ainda esta inicializando.

#### 3. Adicionar log de connectionState no bloco 404

Antes de declarar que nao obteve QR, verificar o `connectionState` da instancia recem-criada. Se estiver `connecting`, informar ao usuario que a instancia esta inicializando.

### Detalhes Tecnicos

**Bloco 404 (linhas 729-840)** - Modificacoes:

- Linha 793: Mudar `setTimeout(resolve, 1000)` para `setTimeout(resolve, 5000)`
- Apos linha 802: Adicionar retry loop (ate 2 tentativas com 5s entre elas) para o connect, extraindo QR em cada tentativa
- Se QR obtido em qualquer tentativa: retornar sucesso imediatamente (sem cair no fluxo de corrupted session)
- Se nenhuma tentativa retornar QR: verificar connectionState e retornar resposta adequada

**Bloco corrupted session (linhas 866-1128)** - Adicionar guard:

- Adicionar flag `wasRecreatedFrom404` que e setada `true` quando o fluxo 404 ja fez recreate
- Se `wasRecreatedFrom404 === true` e `isCorruptedSession === true`: pular todo o recovery e retornar mensagem pedindo ao usuario para aguardar, pois ja foi recriada

**Nenhuma outra action e afetada** - todas as demais (send_message, delete, configure_webhook, etc.) permanecem inalteradas.

### Resultado Esperado

- Instancias que retornam 404 serao recriadas e terao tempo suficiente para inicializar
- Nao havera mais cascata de delete+recreate em cima de instancias recem-criadas
- Mensagens de erro serao mais claras para o usuario
- Instancias que realmente estao conectadas (Step 0 do connectionState) continuarao sendo detectadas corretamente

