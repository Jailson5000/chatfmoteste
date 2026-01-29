

# Configuração: Ativar ASAAS e Sistema de Pagamento com Trial

## Análise do Estado Atual

| Configuração | Valor Atual | Ação Necessária |
|--------------|-------------|-----------------|
| `ASAAS_API_KEY` | Configurada (antiga) | **Atualizar** com nova chave |
| `payment_provider` | `asaas` | ✅ OK - Já está ASAAS |
| `payments_disabled` | `true` | **Mudar para `false`** |
| `manual_registration_enabled` | `true` | ✅ OK - Mantém cadastro manual |
| `auto_trial_with_plan_enabled` | `true` | ✅ OK - Trial já habilitado |

## O que será feito

### 1. Atualizar Chave API do ASAAS
A chave atual será substituída pela nova chave fornecida:
```
$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmEyMDlm...
```

### 2. Ativar Pagamentos Online
Mudar `payments_disabled` de `true` → `false` para liberar o checkout.

### 3. Fluxo do Cliente (Já Configurado)

O sistema atual já está preparado para:

```text
Cliente acessa Landing Page
         │
         ▼
Clica em "Escolher Plano"
         │
         ▼
Modal de Checkout abre
         │
         ▼ (manual_registration_enabled = true)
         │
Redireciona para página de Cadastro (/register)
         │
         ▼
Preenche dados + Escolhe Plano
         │
         ▼
Empresa fica PENDENTE para aprovação
         │
         ▼
Admin aprova → Trial de 7 dias inicia
         │
         ▼
Após trial → Cobrança ASAAS
```

## Passos Técnicos

### Passo 1: Atualizar Secret
Usar a ferramenta `add_secret` para atualizar `ASAAS_API_KEY`

### Passo 2: Atualizar system_settings
```sql
UPDATE system_settings 
SET value = 'false' 
WHERE key = 'payments_disabled';
```

## Segurança

- A chave API ASAAS é armazenada de forma segura nas Secrets do backend
- Nunca é exposta no frontend
- Apenas as Edge Functions têm acesso

## Teste Recomendado

Após configuração:
1. Acessar a Landing Page
2. Clicar em "Escolher Plano" em qualquer plano
3. Verificar se o modal redireciona para `/register`
4. Preencher formulário de teste
5. Verificar se empresa aparece em Empresas → Pendentes

