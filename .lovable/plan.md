

# Corrigir QR Code nao gerando - Bug conhecido da Evolution API

## Diagnostico

Os logs mostram claramente o problema:

```text
/instance/connect -> {"count":0}  (toda vez)
connectionState -> "connecting"   (preso para sempre)
Nenhum evento qrcode.update recebido via webhook
```

Isso e um **bug conhecido da Evolution API v2.2.x** (Issues #2365 e #2367 no GitHub). O Baileys entra em um loop infinito de reconexao durante a conexao inicial, impedindo a geracao do QR code. O fix foi incluido apenas na v2.3.7+.

## Opcoes de Solucao

### Opcao A: Workaround no Docker Compose (mais rapido)
Adicionar a variavel de ambiente `CONFIG_SESSION_PHONE_VERSION` no container da Evolution API:

```text
docker exec -it evolution bash
# Ou editar o docker-compose.yml:

environment:
  CONFIG_SESSION_PHONE_VERSION: "2.3000"
```

Depois reiniciar:
```text
docker compose down && docker compose up -d
```

Esse workaround foi reportado como funcional por usuarios na issue #2367.

### Opcao B: Voltar para v2.3.1 (recomendado)
O v2.2.3 tem esse bug critico sem correcao oficial. As opcoes mais estaveis sao:
- **v2.3.1** - que ja estava em uso (tem o delay do Baileys v7, mas as edge functions ja lidam com isso)
- **v2.3.7** - tem o fix oficial do bug #2365, mas pode ter outros problemas reportados

Para voltar ao v2.3.1:
```text
sed -i 's|atendai/evolution-api:v2.2.3|evoapicloud/evolution-api:v2.3.1|' docker-compose.yml
docker compose down && docker compose pull && docker compose up -d
```

### Opcao C: Usar v2.3.7 com o fix oficial
```text
sed -i 's|atendai/evolution-api:v2.2.3|atendai/evolution-api:v2.3.7|' docker-compose.yml
docker compose down && docker compose pull && docker compose up -d
```

## Mudancas no Codigo

### Se escolher Opcao B (v2.3.1)
- Reverter as mudancas feitas nas edge functions (restaurar retries originais)
- Manter a logica de recovery simplificada que ja funciona

### Se escolher Opcao C (v2.3.7)
- As edge functions atuais ja sao compativeis
- Nenhuma mudanca de codigo necessaria

### Se escolher Opcao A (workaround)
- Nenhuma mudanca de codigo necessaria
- Apenas adicionar a variavel de ambiente e reiniciar o container

## Recomendacao

**Opcao B (voltar para v2.3.1)** e a mais segura porque:
1. Ja estava funcionando antes (o problema era apenas o delay de inicializacao)
2. As edge functions ja foram adaptadas para lidar com o delay do Baileys v7
3. Nao depende de um workaround nao-oficial

Apos escolher a opcao, as unicas mudancas necessarias no codigo serao reverter os timeouts de retry na edge function para os valores originais compatveis com v2.3.x (delays maiores para acomodar o Baileys v7).

