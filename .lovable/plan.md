

# Plano: Mover Configuração de IA Global para IAs APIs

## Problema

A seção "Configuração de IA Global" (provedor Gemini, fallback, chave API) foi colocada incorretamente em **Configurações** (`GlobalAdminSettings.tsx`), quando deveria estar em **IAs APIs** (`GlobalAdminAIAPIs.tsx`).

## O que será movido

O card completo com:
- Seleção de Provedor Principal (Lovable / Gemini)
- Campo de Chave API Gemini
- Seleção de Modelo Gemini
- Switch de Fallback Automático
- Botão de Testar Conexão

## Mudanças

### 1. GlobalAdminAIAPIs.tsx

Adicionar no **TOPO** da lista de providers (antes do card "IA do Site"):

- Estados para controlar Gemini:
  - `primaryProvider` (lovable/gemini)
  - `geminiApiKey`
  - `geminiModel`
  - `enableFallback`
  - `showGeminiKey`
  - `testingConnection`
  - `connectionStatus`

- Função `testGeminiConnection` para testar a conexão

- Novo card **"Provedor IA Principal + Fallback"** com:
  - RadioGroup para selecionar provedor (Lovable/Gemini)
  - Input para chave API Gemini
  - Select para modelo Gemini
  - Switch para fallback automático
  - Botão testar conexão

- Atualizar `handleSave` para incluir as novas configurações

### 2. GlobalAdminSettings.tsx

Remover completamente:
- O card "Configuração de IA Global" (linhas 128-320)
- Estados relacionados: `showGeminiKey`, `testingConnection`, `connectionStatus`
- Função `testGeminiConnection`
- Imports não usados: `Brain`, `Eye`, `EyeOff`, `CheckCircle`, `XCircle`

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/global-admin/GlobalAdminAIAPIs.tsx` | Adicionar card de configuração global de IA |
| `src/pages/global-admin/GlobalAdminSettings.tsx` | Remover card de configuração de IA |

## Resultado

- **IAs APIs**: Terá todas as configurações de IA em um só lugar (Lovable/Gemini, OpenAI, N8N, ElevenLabs)
- **Configurações**: Ficará apenas com Pagamentos, Alertas, Geral, Faturamento, Armazenamento

## Checklist

- [ ] Card de configuração de IA aparece em IAs APIs
- [ ] Card removido de Configurações
- [ ] Testar conexão Gemini funcionando
- [ ] Salvar configurações funcionando
- [ ] Fallback toggle funcionando
- [ ] Nenhum erro no console

