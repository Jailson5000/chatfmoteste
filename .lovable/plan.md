

## ✅ CONCLUÍDO - Corrigir Sincronização de Status Evolution API

### Fixes aplicados

1. **`evolution-api/index.ts` - `refresh_status`**: Usa `fetchInstances` como fonte primária (mesmo endpoint do Manager UI). Botão "Atualizar Status" agora reflete o estado real.

2. **`auto-reconnect-instances/index.ts` - `checkConnectionState`**: Usa `fetchInstances` como fonte primária. Ciclo destrutivo quebrado - instâncias conectadas são reconhecidas e NÃO reiniciadas desnecessariamente.

### Resultado

| Componente | Antes | Depois |
|---|---|---|
| refresh_status | connectionState (stale) | fetchInstances (real) |
| auto-reconnect | connectionState → reinicia sessões conectadas | fetchInstances → reconhece e sincroniza DB |
| Instâncias | Loop infinito connecting→connect | Estabilizam como connected |
| Mensagens | Zero messages.upsert | Fluxo restaurado |
