

# Atualizar META_INSTAGRAM_APP_SECRET

O problema do Instagram esta confirmado: o **App Secret** configurado no backend esta incorreto. Por isso o Instagram retorna erro na troca do codigo por token.

## Acao necessaria

Atualizar o secret `META_INSTAGRAM_APP_SECRET` com o valor correto do painel Meta Developer Console.

### Onde encontrar o valor correto:
1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Selecione o app do Instagram (ID: `1447135433693990`)
3. Va em **App Settings > Basic**
4. Copie o campo **App Secret**

### Alteracao tecnica

| Acao | Detalhe |
|------|---------|
| Atualizar secret `META_INSTAGRAM_APP_SECRET` | Substituir o valor atual (que comeca com `2eee...`) pelo App Secret correto do painel da Meta |

Nenhuma alteracao de codigo e necessaria. Apenas a atualizacao do secret.
