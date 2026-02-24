

# Atualizar Vozes: Remover Felipe, Adicionar Roberto

## Mudanca

No arquivo `src/lib/voiceConfig.ts`:

- **Remover**: Felipe (`el_felipe`, externalId: `GxZ0UJKPezKah8TMxZZM`)
- **Adicionar**: Roberto (`el_roberto`, externalId: `qtRuzSBBS6RO6Odr5QHI`) — voz masculina

## Codigo

```typescript
// Linha 16 - substituir Felipe por Roberto:
{ id: "el_roberto", name: "Roberto", gender: "male", description: "Voz masculina profissional de alta qualidade", externalId: "qtRuzSBBS6RO6Odr5QHI" },
```

## Arquivo afetado

| Arquivo | Mudanca |
|---|---|
| `src/lib/voiceConfig.ts` | Trocar entrada do Felipe pela do Roberto |

Nenhuma outra mudanca necessaria — todos os componentes (AIVoiceSettings, AIAgentEdit, AudioModeIndicator) ja consomem o array `AVAILABLE_VOICES` dinamicamente.

