
# Plano de Correção: Adicionar Minutos de Áudio ao Plano BASIC

## Problema Identificado

O plano BASIC possui `max_tts_minutes: 15` no banco de dados, mas a lista de features não inclui a linha "15 minutos de áudio".

### Comparativo dos Planos:
| Plano | max_tts_minutes | Feature de áudio listada? |
|-------|-----------------|---------------------------|
| PRIME | 10 | ✓ "10 minutos de áudio" |
| BASIC | 15 | ❌ **FALTANDO** |
| STARTER | 25 | ✓ "25 minutos de áudio" |
| PROFESSIONAL | 40 | ✓ "40 minutos de áudio" |
| ENTERPRISE | 60 | ✓ "60 minutos de áudio" |

---

## Solução

Atualizar a coluna `features` do plano BASIC no banco de dados para incluir "15 minutos de áudio" na posição correta (após "200 conversas com IA", seguindo o padrão dos outros planos).

### Features Atuais do BASIC:
1. 2 usuários
2. 200 conversas com IA
3. 1 WhatsApp conectado
4. 1 agente de IA
5. Automação essencial
6. Mensagens rápidas
7. Respostas automáticas

### Features Corrigidas do BASIC:
1. 2 usuários
2. 200 conversas com IA
3. **15 minutos de áudio** ← NOVO
4. 1 WhatsApp conectado
5. 1 agente de IA
6. Automação essencial
7. Mensagens rápidas
8. Respostas automáticas

---

## Execução

Executar uma migration SQL para atualizar o array de features do plano BASIC:

```sql
UPDATE plans 
SET features = ARRAY[
  '2 usuários',
  '200 conversas com IA',
  '15 minutos de áudio',
  '1 WhatsApp conectado',
  '1 agente de IA',
  'Automação essencial',
  'Mensagens rápidas',
  'Respostas automáticas'
]
WHERE name = 'BASIC';
```

---

## Resultado Esperado

O plano BASIC na landing page mostrará "15 minutos de áudio" alinhado com os demais planos, mantendo a consistência visual e informacional.
