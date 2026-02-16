
# Correcao: Erro PGRST201 no fetchSingleConversation

## Causa Raiz

O log do console mostra claramente o erro:

```
[fetchSingleConversation] Direct query error:
  code: "PGRST201"
  message: "Could not embed because more than one relationship found 
            for 'conversations' and 'whatsapp_instances'"
```

A tabela `conversations` tem **mais de uma foreign key** apontando para `whatsapp_instances`. O PostgREST nao sabe qual usar e retorna erro. A query precisa especificar o nome da FK explicitamente.

## Correcao

### Arquivo: `src/hooks/useConversations.tsx` (linha 1215)

Trocar:
```
whatsapp_instance:whatsapp_instances(instance_name, display_name, phone_number)
```

Por:
```
whatsapp_instance:whatsapp_instances!conversations_whatsapp_instance_id_fkey(instance_name, display_name, phone_number)
```

Esse e o mesmo padrao ja usado em outros hooks do projeto (ex: `useClients.tsx` linha 71).

## Risco

**Zero**. Apenas adicionamos a dica de FK que o PostgREST precisa para desambiguar. Nenhuma outra mudanca necessaria.
