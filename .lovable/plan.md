

# Plano: Reforço do Prompt de Cálculo de Prazo + Análise de Foto de Perfil

---

## PARTE 1: Correção do Cálculo de Prazo da IA (APROVADO)

### Problema
A IA está errando cálculos de prazo (ex: "2014 está dentro de 10 anos" quando na verdade 2026 - 2014 = 12 anos, ou seja, FORA).

### Causa
A instrução atual é genérica demais. Modelos de linguagem não são bons em matemática e precisam de exemplos numéricos concretos.

### Arquivo a Alterar
`supabase/functions/ai-chat/index.ts` - **Linhas 3672-3684**

### Código Atual

```javascript
const autoCurrentDate = autoDateFormatter.format(autoInjectNow);
const autoCurrentTime = autoTimeFormatter.format(autoInjectNow);

const dateContextPrefix = `📅 CONTEXTO TEMPORAL (SEMPRE CONSIDERE):
Data de hoje: ${autoCurrentDate}
Hora atual: ${autoCurrentTime}
Fuso horário: ${autoInjectTimezone}

REGRA CRÍTICA: Sempre considere a data atual ao fazer cálculos de prazos, analisar datas mencionadas pelo cliente, ou responder perguntas que envolvam tempo.

---

`;
```

### Código Novo

```javascript
const autoCurrentDate = autoDateFormatter.format(autoInjectNow);
const autoCurrentTime = autoTimeFormatter.format(autoInjectNow);

// Extract current year for explicit calculation examples
const currentYearNumber = autoInjectNow.toLocaleString("en-US", { 
  timeZone: autoInjectTimezone, 
  year: "numeric" 
});
const currentYear = parseInt(currentYearNumber, 10);

const dateContextPrefix = `📅 CONTEXTO TEMPORAL (SEMPRE CONSIDERE):
Data de hoje: ${autoCurrentDate}
Hora atual: ${autoCurrentTime}
Fuso horário: ${autoInjectTimezone}
ANO ATUAL: ${currentYear}

### REGRA DE CÁLCULO DE PRAZOS (OBRIGATÓRIA) ###

Para verificar se uma data/ano está DENTRO de um prazo de X anos:
1. Calcule: ANO_ATUAL (${currentYear}) - ANO_MENCIONADO = diferença
2. Se diferença > X → FORA DO PRAZO (não qualifica)
3. Se diferença <= X → DENTRO DO PRAZO (qualifica)

EXEMPLOS PARA PRAZO DE 10 ANOS (referência ${currentYear}):
- ${currentYear - 12}: ${currentYear} - ${currentYear - 12} = 12 → FORA (12 > 10)
- ${currentYear - 11}: ${currentYear} - ${currentYear - 11} = 11 → FORA (11 > 10)
- ${currentYear - 10}: ${currentYear} - ${currentYear - 10} = 10 → DENTRO (10 = 10)
- ${currentYear - 9}: ${currentYear} - ${currentYear - 9} = 9 → DENTRO (9 < 10)

ATENÇÃO: Sempre faça o cálculo ANTES de responder sobre prazos. NÃO assuma que qualquer ano está "dentro" sem calcular.

---

`;
```

### Resultado Esperado

Para o ano de 2026, o prompt injetado será:

```text
EXEMPLOS PARA PRAZO DE 10 ANOS (referência 2026):
- 2014: 2026 - 2014 = 12 → FORA (12 > 10)
- 2015: 2026 - 2015 = 11 → FORA (11 > 10)
- 2016: 2026 - 2016 = 10 → DENTRO (10 = 10)
- 2017: 2026 - 2017 = 9 → DENTRO (9 < 10)
```

---

## PARTE 2: Análise do Problema de Foto de Perfil

### Diagnóstico Completo

Analisei os logs do edge function `evolution-api` e encontrei evidência clara do comportamento:

**Log 1 (Funciona):**
```text
15:47:50 - [fetch_profile_picture] Response: {..., "profilePictureUrl": "https://pps.whatsapp.net/v/..."}
15:47:50 - [fetch_profile_picture] Avatar updated for client: bde034b3...
```

**Log 2 (Não funciona):**
```text
15:46:47 - [fetch_profile_picture] Response: {..., "profilePictureUrl": null}
```

### Causa Raiz

O problema **NÃO é um bug no código**. É uma limitação da API do WhatsApp:

1. **Privacidade do Usuário**: Se o contato configurou "Foto de perfil: Meus contatos", o sistema não consegue buscar
2. **Tipo de Conexão**: A mesma pessoa pode ter foto visível em uma instância (onde é contato) e não em outra (onde não é)
3. **Diferentes Instâncias**: Você está testando várias instâncias conectadas ao seu próprio número. Cada instância pode ter permissões diferentes

### O Que o Sistema Já Faz Corretamente

| Funcionalidade | Status |
|----------------|--------|
| Botão de atualizar foto manual | ✅ Funciona |
| Busca automática no webhook | ✅ Funciona |
| Salvamento no banco `clients.avatar_url` | ✅ Funciona |
| Exibição no frontend | ✅ Funciona |
| Tratamento de privacidade (mensagem amigável) | ✅ Funciona |

### Por Que a Mensagem "Foto não disponível"

O sistema retorna corretamente:
```javascript
"Foto não disponível (usuário pode ter privacidade ativada)"
```

Isso acontece quando:
- `profilePictureUrl` retorna `null` da API Evolution
- O contato bloqueou a visualização de foto para não-contatos

### Sugestões de Melhoria (Opcionais)

1. **Tentar múltiplas instâncias**: Se uma instância não retorna foto, tentar outra que esteja conectada
2. **Cache de tentativas**: Não tentar buscar foto novamente se já falhou recentemente
3. **Feedback mais detalhado**: Mostrar qual instância foi usada para buscar

---

## RESUMO FINAL

### O Que Será Corrigido

| Item | Arquivo | Ação |
|------|---------|------|
| Cálculo de prazo incorreto | `ai-chat/index.ts` | Adicionar exemplos numéricos dinâmicos |

### O Que Não Precisa de Correção

| Item | Status | Motivo |
|------|--------|--------|
| Foto de perfil | ✅ OK | Comportamento esperado quando usuário tem privacidade ativada |

### Deploy Necessário

- Edge Function: `ai-chat`

### Teste Recomendado

1. Em uma conversa com a IA, perguntar: "Me aposentei em 2014, tenho direito à revisão?"
2. Verificar se a IA responde que 2014 está **FORA** do prazo de 10 anos (12 > 10)

