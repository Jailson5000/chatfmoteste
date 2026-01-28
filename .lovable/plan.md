
# Campo de Subdomínio Personalizável no Cadastro

## Objetivo

Permitir que o usuário escolha seu próprio subdomínio durante o cadastro, com validação em tempo real de disponibilidade.

## Solução Proposta

Adicionar um campo de "Subdomínio" no formulário de registro com:
1. **Preview em tempo real**: `[campo].miauchat.com.br`
2. **Validação de caracteres**: apenas letras minúsculas, números (sem hífens obrigatórios)
3. **Verificação de disponibilidade**: consulta ao banco antes de enviar
4. **Sugestão automática**: baseada no nome da empresa (o usuário pode editar)

## Fluxo de UX

```text
┌──────────────────────────────────────────────────────────────────┐
│  Nome da Empresa: [Liz Importados]                               │
│                                                                  │
│  Seu Subdomínio:                                                 │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ lizimportados                                            │    │
│  └──────────────────────────────────────────────────────────┘    │
│  → lizimportados.miauchat.com.br   ✅ Disponível                 │
│                                                                  │
│  (O usuário pode mudar para "liz", "lizimport", etc.)            │
└──────────────────────────────────────────────────────────────────┘
```

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Register.tsx` | Adicionar campo de subdomínio + validação + preview |
| `src/lib/schemas/companySchema.ts` | Adicionar campo `subdomain` ao schema |
| `supabase/functions/register-company/index.ts` | Aceitar `subdomain` customizado e validar disponibilidade |

## Implementação Técnica

### 1. Schema (`src/lib/schemas/companySchema.ts`)

```typescript
// Adicionar ao publicRegistrationSchema
subdomain: z
  .string()
  .min(3, "Subdomínio deve ter no mínimo 3 caracteres")
  .max(30, "Subdomínio deve ter no máximo 30 caracteres")
  .regex(/^[a-z0-9]+$/, "Apenas letras minúsculas e números (sem hífens ou espaços)")
  .optional()
  .transform((val) => val?.toLowerCase() || undefined),
```

### 2. Formulário (`src/pages/Register.tsx`)

**Estado adicional:**
```typescript
const [formData, setFormData] = useState({
  companyName: "",
  adminName: "",
  email: "",
  phone: "",
  document: "",
  planId: "",
  subdomain: "", // NOVO
});

const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
```

**Função para gerar sugestão (sem hífens):**
```typescript
function generateSubdomainSuggestion(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '')       // remove tudo exceto letras e números
    .substring(0, 30);
}
```

**Auto-preenchimento ao digitar nome da empresa:**
```typescript
onChange={(e) => {
  const newName = e.target.value;
  setFormData(prev => ({
    ...prev,
    companyName: newName,
    // Auto-sugerir subdomínio se o usuário não editou manualmente
    subdomain: prev.subdomain === generateSubdomainSuggestion(prev.companyName) 
      ? generateSubdomainSuggestion(newName)
      : prev.subdomain
  }));
}}
```

**Novo campo de subdomínio:**
```tsx
<div className="space-y-2">
  <Label htmlFor="subdomain" className="text-zinc-300">
    Seu Subdomínio
  </Label>
  <div className="relative">
    <Input
      id="subdomain"
      type="text"
      placeholder="suaempresa"
      maxLength={30}
      className="bg-zinc-800/50 border-zinc-700 text-white"
      value={formData.subdomain}
      onChange={(e) => {
        const value = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
        setFormData({ ...formData, subdomain: value });
        checkSubdomainAvailability(value);
      }}
    />
  </div>
  <div className="flex items-center gap-2 text-sm">
    <span className="text-zinc-500">→</span>
    <span className="text-zinc-400">
      {formData.subdomain || 'suaempresa'}.miauchat.com.br
    </span>
    {subdomainStatus === 'checking' && (
      <span className="text-zinc-500">Verificando...</span>
    )}
    {subdomainStatus === 'available' && (
      <span className="text-green-500">✅ Disponível</span>
    )}
    {subdomainStatus === 'taken' && (
      <span className="text-red-500">❌ Já em uso</span>
    )}
  </div>
</div>
```

**Verificação de disponibilidade (debounced):**
```typescript
const checkSubdomainAvailability = useMemo(() => 
  debounce(async (subdomain: string) => {
    if (subdomain.length < 3) {
      setSubdomainStatus('idle');
      return;
    }
    setSubdomainStatus('checking');
    
    const { data } = await supabase
      .from('law_firms')
      .select('id')
      .eq('subdomain', subdomain)
      .maybeSingle();
    
    setSubdomainStatus(data ? 'taken' : 'available');
  }, 500),
[]);
```

### 3. Edge Function (`register-company/index.ts`)

**Aceitar subdomain customizado:**
```typescript
interface RegisterRequest {
  company_name: string;
  admin_name: string;
  admin_email: string;
  phone?: string;
  document?: string;
  plan_id?: string;
  subdomain?: string; // NOVO - customizado pelo usuário
  website?: string;
}
```

**Validar e usar o subdomain informado:**
```typescript
// Se o usuário informou um subdomain customizado, usar ele
// Senão, gerar automaticamente a partir do nome
let subdomain = body.subdomain || generateSubdomain(company_name);

// Validar formato (apenas letras minúsculas e números)
if (!/^[a-z0-9]{3,30}$/.test(subdomain)) {
  return new Response(
    JSON.stringify({ error: 'Subdomínio inválido. Use apenas letras minúsculas e números (3-30 caracteres)' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Verificar disponibilidade
const { data: existingSubdomain } = await supabase
  .from('law_firms')
  .select('id')
  .eq('subdomain', subdomain)
  .single();

if (existingSubdomain) {
  return new Response(
    JSON.stringify({ error: 'Este subdomínio já está em uso. Por favor, escolha outro.' }),
    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

## Exemplos de Resultado

| Nome da Empresa | Sugestão Automática | Usuário pode mudar para |
|-----------------|---------------------|-------------------------|
| Liz Importados | `lizimportados` | `liz`, `lizimport` |
| Café & Companhia | `cafecompanhia` | `cafe`, `cafecia` |
| Dr. João Silva | `drjoaosilva` | `joaosilva`, `drjoao` |

## Validações

1. **Mínimo 3 caracteres** - evita conflitos e subdomínios muito curtos
2. **Máximo 30 caracteres** - limite de DNS
3. **Apenas `a-z` e `0-9`** - sem hífens, acentos ou espaços (mais limpo)
4. **Verificação em tempo real** - feedback imediato de disponibilidade
5. **Verificação server-side** - proteção contra race conditions

## Testes de Não-Regressão

1. **Cadastro com subdomínio padrão**: não informar nada → usa sugestão automática
2. **Cadastro com subdomínio customizado**: informar `liz` → usa `liz`
3. **Subdomínio já em uso**: informar um existente → erro claro
4. **Caracteres inválidos**: não permitir hífens, espaços, acentos

## Risco

**Baixo** - A alteração adiciona funcionalidade sem modificar fluxos existentes. O comportamento padrão (auto-geração) continua funcionando se o campo não for preenchido.
