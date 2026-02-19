

# Persistir Midias Instagram/Facebook + Limpeza Automatica

## Diagnostico

### O que acontece hoje
- **Avatar**: A URL temporaria da Meta (`lookaside.fbsbx.com`) e salva diretamente em `clients.avatar_url`. Expira em horas.
- **Midia de mensagens**: A `media_url` temporaria e salva diretamente em `messages.media_url`. Expira em horas.
- **Ao deletar conversa**: Os registros de `messages` sao apagados via `ON DELETE CASCADE`, mas os **arquivos no bucket `chat-media` NAO sao apagados** -- ficam orfaos consumindo espaco.

### O que sera corrigido
1. Avatares e midias de mensagens serao baixados e salvos permanentemente no bucket
2. Uma funcao de limpeza automatica ira apagar arquivos do bucket quando conversas/clientes forem deletados

## Alteracoes

### 1. Persistir avatar no bucket (`meta-webhook/index.ts`)

Na secao de resolucao de perfil (linha 470-476), ao obter `profile_pic`:

- Baixar a imagem da URL temporaria
- Fazer upload para `chat-media/{law_firm_id}/avatars/{client_id}.jpg`
- Salvar a URL publica permanente em `clients.avatar_url`

Isso ja segue o padrao existente do sistema de avatares do WhatsApp (descrito na memoria `avatar-persistence-logic`).

### 2. Persistir midia de mensagens no bucket (`meta-webhook/index.ts`)

Antes do insert da mensagem (linha 553), quando `mediaUrl` e uma URL HTTP temporaria:

- Baixar o conteudo binario
- Fazer upload para `chat-media/{law_firm_id}/{conversation_id}/{mid}.{ext}`
- Substituir a URL temporaria pela URL publica permanente

### 3. Limpeza automatica de arquivos orfaos (nova migration SQL)

Criar triggers que apagam arquivos do bucket `chat-media` quando registros sao deletados:

**Opcao mais segura -- funcao de limpeza periodica via Edge Function**:
- Criar uma edge function `cleanup-orphan-media` que verifica arquivos no bucket sem correspondencia no banco
- Pode ser chamada manualmente ou agendada

**Motivo**: Triggers SQL nao conseguem chamar a Storage API diretamente para deletar arquivos. A limpeza precisa ser feita via codigo (Edge Function ou chamada manual).

### Resumo de impacto no espaco

- **Avatares**: Muito pequenos (~5-20KB cada), impacto minimo
- **Midias de mensagens**: Podem ser maiores (fotos 100-500KB, videos ate varios MB), mas e necessario para manter o historico funcional
- **Sem persistencia**: As midias ficam "quebradas" em poucas horas, tornando o historico inutil

## Arquivos alterados

1. `supabase/functions/meta-webhook/index.ts` -- persistencia de avatar e midia (redeploy necessario)
2. Nova migration SQL -- (opcional) funcao helper para limpeza

## Respondendo a pergunta sobre limpeza

**Hoje**: Quando uma conversa e apagada, as **mensagens** sao removidas do banco (CASCADE), mas os **arquivos no bucket continuam la**. Isso vale para WhatsApp tambem, nao so Instagram/Facebook. Posso criar uma funcao de limpeza para resolver isso, mas e uma melhoria separada -- o foco principal aqui e garantir que as midias sejam persistidas e visiveis permanentemente.
