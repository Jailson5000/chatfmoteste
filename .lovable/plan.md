
# Priorizar PSID para Facebook (com foto de perfil)

## Situacao Atual

O codigo ja tem as duas abordagens implementadas, mas na ordem errada:
1. Primeiro tenta via `mid` (so retorna nome, sem foto)
2. Se falhar, tenta via PSID (retorna nome + foto, mas precisa da feature aprovada)

Como o `mid` funciona, ele nunca chega no PSID. Quando a Meta aprovar a feature, o sistema continuaria sem pegar a foto.

## Correcao

Inverter a ordem no arquivo `supabase/functions/meta-webhook/index.ts` (linhas 412-441):

1. **Primeiro**: tentar PSID (`graph.facebook.com/{senderId}?fields=first_name,last_name,profile_pic`) - vai funcionar automaticamente quando a feature for aprovada, trazendo nome E foto
2. **Fallback**: se PSID falhar (feature ainda nao aprovada), usar o `mid` para pelo menos pegar o nome

## Resultado

- **Antes da aprovacao**: comportamento identico ao atual (PSID falha, cai no `mid`, pega o nome)
- **Apos a aprovacao**: PSID funciona na primeira tentativa, trazendo nome E foto automaticamente, sem necessidade de nenhuma alteracao adicional

## Arquivo alterado

- `supabase/functions/meta-webhook/index.ts` - inverter ordem PSID/mid no bloco Facebook (redeploy necessario)
