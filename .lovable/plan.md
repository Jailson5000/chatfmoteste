

# Corrigir Evolution API - Reverter versao e estabilizar conexoes

## Diagnostico

O `docker-compose.yml` usa `image: evoapicloud/evolution-api:latest`, que puxou automaticamente a versao 2.3.7. Como o QR code nao funciona **nem no Manager da Evolution**, o problema e da versao da imagem Docker, nao do codigo da plataforma.

## Solucao em 2 partes

### Parte 1 - Infraestrutura (voce executa no servidor)

Trocar a imagem `latest` por uma versao fixa que estava funcionando. A ultima versao estavel conhecida para Baileys e a **2.2.3** ou **2.1.1**. Como voce estava na 2.3.x e funcionava no sabado, vamos tentar primeiro a **2.3.3** (versao anterior a 2.3.7):

```text
No docker-compose.yml, trocar:
  image: evoapicloud/evolution-api:latest
Por:
  image: evoapicloud/evolution-api:v2.3.3
```

Depois aplicar:

```text
cd /opt/stacks/evolution
docker compose down
docker compose pull
docker compose up -d
sleep 30
docker stats --no-stream
```

Se 2.3.3 nao funcionar, testar `v2.3.5` ou `v2.3.0`.

### Parte 2 - Codigo (eu implemento)

Ajustar a edge function `evolution-api` para:

1. **Adicionar timeout mais curto no Level 1** - reduzir de 15s para 10s por tentativa, dando mais agilidade ao fluxo
2. **Adicionar deteccao de versao da API** - logar a versao da Evolution detectada para futuro debug
3. **Melhorar mensagem de erro** - quando todos os niveis falharem, informar claramente que o problema pode ser da versao da API

### Arquivo modificado

- `supabase/functions/evolution-api/index.ts` - ajustes menores no fluxo de recovery

## Ordem de execucao

1. Voce altera o `docker-compose.yml` no servidor (pinando a versao)
2. Eu ajusto o codigo da edge function
3. Voce testa gerando QR code no Manager da Evolution primeiro
4. Se funcionar no Manager, testa pela plataforma

## Por que isso aconteceu

A tag `latest` no Docker sempre puxa a versao mais recente. Quando a Evolution API lancou a 2.3.7, o restart do Docker baixou essa versao automaticamente, substituindo a que estava funcionando. Pinar a versao impede isso no futuro.

