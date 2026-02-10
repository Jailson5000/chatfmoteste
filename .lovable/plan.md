

# Correção: Botão "Dispensar" do Badge "Via Anúncio" Não Funciona

## Problema

O botão de dispensar (X) no banner de anúncio dentro do chat **existe**, mas após clicar nele:
1. O banco de dados é atualizado corretamente (origin e origin_metadata viram null)
2. O cache local **não é invalidado**, então a conversa continua mostrando o badge "Via Anúncio" na sidebar e o banner no chat até dar F5

## Causa Raiz

No `src/pages/Conversations.tsx` (linhas 4106-4116), o `onDismiss` faz o update no banco mas **não chama** `queryClient.invalidateQueries({ queryKey: ["conversations"] })` após o sucesso.

## Solução

Adicionar invalidação do cache após o update bem-sucedido no handler `onDismiss` do `AdClickBanner`:

```javascript
onDismiss={async () => {
  try {
    await supabase
      .from("conversations")
      .update({ origin_metadata: null, origin: null })
      .eq("id", selectedConversation.id);
    
    // ADICIONAR: Invalidar cache para atualizar sidebar e chat
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    
    toast({ title: "Aviso de anúncio removido" });
  } catch (err) {
    console.error("Error dismissing ad banner:", err);
  }
}}
```

## Impacto

- **Risco**: Nenhum - apenas adiciona uma linha de invalidação de cache (padrão já usado em 40+ lugares no mesmo arquivo)
- **Resultado**: Ao clicar no X, o badge "Via Anúncio" desaparece imediatamente da sidebar e do chat, sem precisar de F5

## Arquivo a Modificar

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `src/pages/Conversations.tsx` | ~4112 | Adicionar `queryClient.invalidateQueries({ queryKey: ["conversations"] })` após o update |
