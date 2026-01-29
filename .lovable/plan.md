

# Plano: Mover Configuração de IA Global para IAs APIs

## ✅ CONCLUÍDO

A seção "Configuração de IA Global" foi movida com sucesso de **Configurações** para **IAs APIs**.

## Mudanças Realizadas

### 1. GlobalAdminAIAPIs.tsx ✅
- Adicionados estados para Gemini: `primaryProvider`, `geminiApiKey`, `geminiModel`, `enableFallback`, etc.
- Adicionada função `testGeminiConnection`
- Novo card **"Provedor IA Principal + Fallback"** no TOPO da lista
- Atualizado `handleSave` para incluir as novas configurações

### 2. GlobalAdminSettings.tsx ✅
- Removido o card "Configuração de IA Global"
- Removidos estados: `showGeminiKey`, `testingConnection`, `connectionStatus`
- Removida função `testGeminiConnection`
- Removidos imports não usados: `Brain`, `Eye`, `EyeOff`, `CheckCircle`, `XCircle`

## Resultado Final

- **IAs APIs**: Contém todas as configurações de IA (Lovable/Gemini, OpenAI, N8N, ElevenLabs)
- **Configurações**: Contém apenas Pagamentos, Alertas, Geral, Faturamento, Armazenamento

## Checklist

- [x] Card de configuração de IA aparece em IAs APIs
- [x] Card removido de Configurações
- [x] Testar conexão Gemini funcionando
- [x] Salvar configurações funcionando
- [x] Fallback toggle funcionando
