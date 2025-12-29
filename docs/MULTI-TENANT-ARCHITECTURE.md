# MiauChat - Arquitetura Multi-Tenant por Subdomínio

## 📋 Visão Geral

Este documento descreve a arquitetura técnica completa para implementação do modelo SaaS Multi-Tenant do MiauChat, utilizando subdomínios para isolamento de clientes.

**Formato de acesso:** `empresa.miauchat.com.br`

---

## 1️⃣ Estrutura do Sistema

### 1.1 Detecção de Tenant

O sistema detecta automaticamente o tenant (empresa) com base no subdomínio da URL:

```
empresa.miauchat.com.br
   │
   └── Subdomínio extraído: "empresa"
              │
              └── Consulta: law_firms.subdomain = "empresa"
                         │
                         └── Carrega dados isolados do tenant
```

### 1.2 Fluxo de Autenticação

```
1. Usuário acessa: empresa.miauchat.com.br
2. Sistema detecta subdomínio "empresa"
3. Busca law_firm com subdomain = "empresa"
4. Exibe tela de login com branding do tenant
5. Após login, valida se usuário pertence ao tenant
6. Carrega dados isolados do tenant
```

### 1.3 Isolamento de Dados

O isolamento é garantido por:

1. **Row Level Security (RLS)** - Políticas no banco que filtram por `law_firm_id`
2. **Contexto de Tenant** - Hook `useTenant()` fornece ID do tenant ativo
3. **Validação de Pertencimento** - Função `get_user_law_firm_id()` valida acesso

---

## 2️⃣ Configuração de DNS

> ⚠️ **IMPORTANTE:** Esta seção é apenas documentação técnica. A configuração real de DNS deve ser feita manualmente no painel do provedor de DNS após revisão pela equipe de infraestrutura.

### 2.1 Registro Wildcard

Para que todos os subdomínios funcionem automaticamente, é necessário configurar um registro DNS wildcard:

#### Opção A: Registro A (Recomendado para IP fixo)

| Campo | Valor |
|-------|-------|
| **Tipo** | A |
| **Nome** | *.miauchat.com.br |
| **Valor** | [IP_DO_SERVIDOR] |
| **TTL** | 3600 (1 hora) |

**Quando usar:**
- Servidor com IP fixo/estático
- Infraestrutura própria (VPS, dedicated server)
- Ambiente sem CDN intermediário

**Vantagens:**
- Configuração mais simples
- Menor latência (sem proxy intermediário)
- Controle total sobre o tráfego

**Desvantagens:**
- Requer IP fixo
- Mudança de servidor requer atualização DNS
- Sem proteção DDoS nativa

#### Opção B: Registro CNAME (Para CDN/Load Balancer)

| Campo | Valor |
|-------|-------|
| **Tipo** | CNAME |
| **Nome** | *.miauchat.com.br |
| **Valor** | lb.miauchat.com.br ou endpoint do CDN |
| **TTL** | 3600 (1 hora) |

**Quando usar:**
- CDN (Cloudflare, AWS CloudFront, Fastly)
- Load Balancer (AWS ALB, GCP Load Balancer)
- Ambiente com IPs dinâmicos
- Necessidade de proteção DDoS

**Vantagens:**
- Flexibilidade para mudar infraestrutura
- Proteção DDoS automática (se CDN)
- Cache de assets
- SSL automático (Cloudflare)

**Desvantagens:**
- Latência adicional (proxy)
- Dependência do provedor CDN
- Pode ter custos adicionais

### 2.2 Tabela Completa de Registros DNS

```dns
# ========================================
# REGISTROS DNS PARA PRODUÇÃO
# ========================================

# Domínio Principal (raiz)
A       @                   185.158.133.1        # Lovable IP
A       www                 185.158.133.1        # Lovable IP

# Wildcard para subdomínios de clientes
A       *                   185.158.133.1        # Lovable IP

# OU se usar Load Balancer/CDN:
# CNAME   *                 lb.miauchat.com.br

# Verificação Lovable
TXT     _lovable            lovable_verify=ABC123

# ========================================
# REGISTROS OPCIONAIS
# ========================================

# API separada (se aplicável)
A       api                 [IP_API_SERVER]

# CDN para assets estáticos
CNAME   assets              cdn.provider.com

# Email (se usar email @miauchat.com.br)
MX      @                   mail.provider.com    10

# SPF para email
TXT     @                   "v=spf1 include:_spf.provider.com ~all"

# DKIM para email
TXT     dkim._domainkey     "v=DKIM1; k=rsa; p=..."
```

### 2.3 Verificação de Propagação DNS

Após configurar os registros, a propagação pode levar de 15 minutos a 72 horas. Use estas ferramentas para verificar:

**Linha de Comando:**
```bash
# Verificar registro A
dig +short empresa.miauchat.com.br A

# Verificar registro wildcard
dig +short qualquercoisa.miauchat.com.br A

# Verificar nameservers
dig +short miauchat.com.br NS

# Verificar TTL
dig miauchat.com.br A +noall +answer
```

**Ferramentas Online:**
- [DNSChecker.org](https://dnschecker.org) - Verificação global
- [WhatsMyDNS.net](https://www.whatsmydns.net) - Propagação por região
- [MXToolbox](https://mxtoolbox.com/SuperTool.aspx) - Diagnóstico completo

### 2.4 Troubleshooting DNS

| Problema | Causa Provável | Solução |
|----------|---------------|---------|
| Subdomínio não resolve | Wildcard não configurado | Adicionar registro `*` |
| Resolve IP errado | Cache DNS | Aguardar TTL ou limpar cache |
| Funciona em um lugar, não em outro | Propagação incompleta | Aguardar até 72h |
| ERR_NAME_NOT_RESOLVED | Registro inexistente | Verificar painel DNS |
| Timeout | Firewall bloqueando | Verificar regras de firewall |

---

## 3️⃣ Configuração SSL/HTTPS

> ⚠️ **IMPORTANTE:** Esta seção é apenas documentação técnica. A configuração real de SSL deve ser feita pela equipe de infraestrutura.

### 3.1 Tipos de Certificado

#### Certificado Wildcard (Recomendado)

Um certificado wildcard cobre o domínio principal e todos os subdomínios de primeiro nível:

```
Domínios cobertos:
✅ miauchat.com.br
✅ www.miauchat.com.br
✅ empresa1.miauchat.com.br
✅ empresa2.miauchat.com.br
✅ [qualquer].miauchat.com.br

Não cobertos:
❌ sub.empresa.miauchat.com.br (segundo nível)
```

#### Certificados Individuais (Alternativa)

Para casos específicos onde wildcard não é viável:
- Geração automática por tenant (Let's Encrypt + certbot)
- Limite de 50 certificados/semana por domínio (Let's Encrypt)
- Maior complexidade operacional

### 3.2 Provedores de Certificado

| Provedor | Custo | Tipo | Validação | Recomendado Para |
|----------|-------|------|-----------|------------------|
| **Let's Encrypt** | Gratuito | DV | Automática | Startups, projetos menores |
| **Cloudflare** | Gratuito* | DV | Automática | Produção com CDN |
| **DigiCert** | $400+/ano | OV/EV | Manual | Enterprise |
| **Sectigo** | $200+/ano | OV | Manual | Enterprise |
| **AWS ACM** | Gratuito* | DV | Automática | Infraestrutura AWS |

*Gratuito dentro do serviço (requer uso do CDN/AWS)

### 3.3 Let's Encrypt com Certbot

```bash
# ========================================
# INSTALAÇÃO
# ========================================

# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx

# ========================================
# GERAÇÃO DE CERTIFICADO WILDCARD
# ========================================

# Método DNS Challenge (obrigatório para wildcard)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d "miauchat.com.br" \
  -d "*.miauchat.com.br" \
  --email admin@miauchat.com.br \
  --agree-tos

# O certbot pedirá para criar registros TXT:
# _acme-challenge.miauchat.com.br → [token_gerado]

# ========================================
# RENOVAÇÃO AUTOMÁTICA
# ========================================

# Testar renovação
sudo certbot renew --dry-run

# Cron para renovação automática (já configurado pelo certbot)
# 0 0,12 * * * /usr/bin/certbot renew --quiet

# ========================================
# LOCALIZAÇÃO DOS CERTIFICADOS
# ========================================

# Certificado: /etc/letsencrypt/live/miauchat.com.br/fullchain.pem
# Chave:       /etc/letsencrypt/live/miauchat.com.br/privkey.pem
```

### 3.4 Cloudflare (SSL Automático)

Se usar Cloudflare como proxy, a configuração é simplificada:

1. **Adicionar domínio ao Cloudflare**
   - Cloudflare fornecerá nameservers (ex: `ella.ns.cloudflare.com`)
   - Atualizar nameservers no registrador do domínio

2. **Configurar SSL/TLS**
   ```
   Dashboard → SSL/TLS → Overview
   └── Selecionar: Full (strict)
   
   Dashboard → SSL/TLS → Edge Certificates
   └── Always Use HTTPS: ON
   └── Automatic HTTPS Rewrites: ON
   └── Minimum TLS Version: TLS 1.2
   ```

3. **Configurar registros DNS**
   ```
   Type    Name    Content           Proxy
   A       @       185.158.133.1     Proxied (☁️)
   A       *       185.158.133.1     Proxied (☁️)
   ```

4. **Certificado Wildcard automático**
   - Cloudflare gera e renova automaticamente
   - Cobre `*.miauchat.com.br`

### 3.5 Nginx - Configuração Completa

```nginx
# ========================================
# /etc/nginx/sites-available/miauchat
# ========================================

# Redirecionar HTTP para HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name *.miauchat.com.br miauchat.com.br;
    
    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

# Servidor HTTPS Principal
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name *.miauchat.com.br miauchat.com.br;

    # ========================================
    # SSL CERTIFICATES
    # ========================================
    ssl_certificate /etc/letsencrypt/live/miauchat.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/miauchat.com.br/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/miauchat.com.br/chain.pem;

    # ========================================
    # SSL SECURITY SETTINGS
    # ========================================
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # ========================================
    # SECURITY HEADERS
    # ========================================
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ========================================
    # GZIP COMPRESSION
    # ========================================
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    # ========================================
    # PROXY TO APPLICATION
    # ========================================
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ========================================
    # STATIC ASSETS CACHING
    # ========================================
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
}
```

### 3.6 Checklist de Segurança SSL

- [ ] TLS 1.2 ou superior (1.0 e 1.1 desabilitados)
- [ ] HSTS habilitado com max-age >= 1 ano
- [ ] Certificado válido para wildcard
- [ ] OCSP Stapling habilitado
- [ ] Cipher suites seguros configurados
- [ ] Redirect HTTP → HTTPS funcionando
- [ ] Testar em [SSL Labs](https://www.ssllabs.com/ssltest/) (objetivo: nota A+)

---

## 4️⃣ Fluxo de Criação de Novo Cliente

### 4.1 Diagrama do Processo

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE ONBOARDING                          │
└─────────────────────────────────────────────────────────────────┘

     CLIENTE                    SISTEMA                     BANCO
        │                          │                          │
        │  1. Acessa signup        │                          │
        │─────────────────────────>│                          │
        │                          │                          │
        │  2. Preenche formulário  │                          │
        │  - Nome da Empresa       │                          │
        │  - Nome do Admin         │                          │
        │  - Email                 │                          │
        │  - Senha                 │                          │
        │─────────────────────────>│                          │
        │                          │                          │
        │                          │  3. Gera subdomínio      │
        │                          │  "Empresa X" → "empresa-x"│
        │                          │                          │
        │                          │  4. Verifica disponibilidade
        │                          │─────────────────────────>│
        │                          │<─────────────────────────│
        │                          │  ✓ Disponível            │
        │                          │                          │
        │                          │  5. Cria law_firm        │
        │                          │─────────────────────────>│
        │                          │                          │
        │                          │  6. Cria company         │
        │                          │─────────────────────────>│
        │                          │                          │
        │                          │  7. Cria auth.user       │
        │                          │─────────────────────────>│
        │                          │                          │
        │                          │  8. Cria profile + role  │
        │                          │─────────────────────────>│
        │                          │                          │
        │                          │  9. Notifica n8n         │
        │                          │──────> [Webhook]         │
        │                          │                          │
        │  10. Redireciona         │                          │
        │  empresa-x.miauchat.com.br                          │
        │<─────────────────────────│                          │
        │                          │                          │
        │  11. Wizard configuração │                          │
        │      - Upload logo       │                          │
        │      - Configurações     │                          │
        │      - WhatsApp          │                          │
        │                          │                          │
        ▼                          ▼                          ▼
```

### 4.2 Geração de Subdomínio

O sistema gera automaticamente um subdomínio baseado no nome da empresa:

```typescript
// Função de geração (já implementada em useTenant.tsx)
function generateSubdomainFromName(companyName: string): string {
  return companyName
    .toLowerCase()                          // Minúsculas
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')       // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '')          // Remove especiais
    .replace(/\s+/g, '-')                   // Espaços → hífens
    .replace(/-+/g, '-')                    // Remove hífens duplos
    .replace(/^-|-$/g, '')                  // Remove hífens extremos
    .slice(0, 63);                          // Limita a 63 chars
}

// Exemplos:
// "FMO Advogados"        → "fmo-advogados"
// "José & Maria Ltda."   → "jose-maria-ltda"
// "Consultório Dr. Silva" → "consultorio-dr-silva"
// "Café & Pão"           → "cafe-pao"
```

### 4.3 Validação de Subdomínio

```typescript
// Regras de validação
const rules = {
  minLength: 2,
  maxLength: 63,
  pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
  reserved: [
    'www', 'api', 'app', 'admin', 'staging', 'dev',
    'mail', 'smtp', 'ftp', 'cdn', 'assets', 'static',
    'support', 'help', 'docs', 'blog', 'global-admin'
  ]
};

// Validação
function isValidSubdomain(subdomain: string): boolean {
  if (subdomain.length < 2 || subdomain.length > 63) return false;
  if (!rules.pattern.test(subdomain)) return false;
  if (rules.reserved.includes(subdomain)) return false;
  return true;
}
```

### 4.4 Estrutura do Tenant no Banco

```sql
-- Ao criar novo cliente, são criados:

-- 1. Law Firm (tenant principal)
INSERT INTO law_firms (id, name, subdomain, email)
VALUES (gen_random_uuid(), 'Empresa X', 'empresa-x', 'contato@empresax.com');

-- 2. Company (gestão comercial)
INSERT INTO companies (id, name, law_firm_id, status, plan_id)
VALUES (gen_random_uuid(), 'Empresa X', [law_firm_id], 'active', [plan_id]);

-- 3. Profile do Admin
INSERT INTO profiles (id, full_name, email, law_firm_id)
VALUES ([user_id], 'Admin', 'admin@empresax.com', [law_firm_id]);

-- 4. Role do Admin
INSERT INTO user_roles (user_id, role)
VALUES ([user_id], 'admin');

-- 5. Automação padrão de IA
INSERT INTO automations (law_firm_id, name, trigger_type, is_active, webhook_url)
VALUES ([law_firm_id], 'Agente de IA', 'message_received', true, '[n8n_url]');
```

---

## 5️⃣ Ambientes (DEV / STAGING / PROD)

### 5.1 Tabela de Ambientes

| Ambiente | Domínio Base | Banco de Dados | Propósito |
|----------|-------------|----------------|-----------|
| **Desenvolvimento** | localhost:5173 | Supabase Dev | Desenvolvimento local |
| **Preview** | *.lovableproject.com | Supabase Dev | Preview de PRs |
| **Staging** | staging.miauchat.com.br | Supabase Staging | Testes e QA |
| **Produção** | miauchat.com.br | Supabase Prod | Ambiente final |

### 5.2 Simulação de Subdomínios em Desenvolvimento

Em ambiente local, subdomínios não funcionam diretamente. Use estas alternativas:

#### Opção 1: Query Parameter (Padrão)
```
http://localhost:5173?tenant=empresa-x

# O sistema detecta automaticamente e carrega o tenant
```

#### Opção 2: Hosts File (Para testes mais realistas)
```bash
# Editar /etc/hosts (Linux/Mac) ou C:\Windows\System32\drivers\etc\hosts (Windows)

127.0.0.1   empresa-x.localhost
127.0.0.1   empresa-y.localhost

# Acessar: http://empresa-x.localhost:5173
```

#### Opção 3: Variável de Ambiente
```bash
# .env.development
VITE_MOCK_TENANT=empresa-x
```

### 5.3 Estrutura de DNS por Ambiente

```
# PRODUÇÃO
*.miauchat.com.br           → IP_PROD
miauchat.com.br             → IP_PROD

# STAGING
*.staging.miauchat.com.br   → IP_STAGING
staging.miauchat.com.br     → IP_STAGING

# API (se separada)
api.miauchat.com.br         → IP_API
api.staging.miauchat.com.br → IP_API_STAGING
```

### 5.4 Boas Práticas por Ambiente

**Desenvolvimento:**
- Usar banco de dados de desenvolvimento
- Simular tenants via query param
- Logs detalhados habilitados
- SSL não obrigatório

**Staging:**
- Espelhar configuração de produção
- Dados de teste (não reais)
- Testar fluxos de onboarding
- SSL obrigatório (wildcard)

**Produção:**
- Monitoramento ativo
- Backup automático de banco
- SSL obrigatório (wildcard)
- Rate limiting configurado
- CDN para assets

---

## 6️⃣ Estrutura de Banco de Dados

### 6.1 Schema Atual

```sql
-- Tabela law_firms (já implementada)
CREATE TABLE law_firms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE,  -- ← Coluna de subdomínio
    email TEXT,
    phone TEXT,
    logo_url TEXT,
    address TEXT,
    document TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca rápida
CREATE INDEX idx_law_firms_subdomain ON law_firms(subdomain);

-- Constraint de formato (validação no banco)
-- Nota: Validação principal é feita na aplicação
```

### 6.2 Funções Existentes

```sql
-- Buscar tenant por subdomínio
CREATE FUNCTION get_law_firm_by_subdomain(_subdomain TEXT)
RETURNS UUID AS $$
    SELECT id FROM law_firms WHERE subdomain = _subdomain
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Obter law_firm do usuário logado
CREATE FUNCTION get_user_law_firm_id(_user_id UUID)
RETURNS UUID AS $$
    SELECT law_firm_id FROM profiles WHERE id = _user_id
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Verificar pertencimento
CREATE FUNCTION user_belongs_to_law_firm(_user_id UUID, _law_firm_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = _user_id AND law_firm_id = _law_firm_id
    )
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

### 6.3 RLS (Row Level Security)

Todas as tabelas sensíveis têm políticas RLS que filtram por `law_firm_id`:

```sql
-- Exemplo de política
CREATE POLICY "Users can only see their law firm data"
ON clients
FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- Política para inserção
CREATE POLICY "Users can only insert to their law firm"
ON clients
FOR INSERT
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));
```

---

## 7️⃣ Arquitetura de Componentes

### 7.1 Diagrama de Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE                                   │
│                  empresa.miauchat.com.br                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DNS WILDCARD                                  │
│              *.miauchat.com.br → IP / Load Balancer             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LOAD BALANCER / CDN                              │
│              (Cloudflare / Nginx / AWS ALB)                      │
│              SSL Wildcard Certificate                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   APLICAÇÃO REACT                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  TenantProvider                           │   │
│  │                                                           │   │
│  │  1. Extrai subdomínio da URL                              │   │
│  │     hostname = "empresa.miauchat.com.br"                  │   │
│  │     subdomain = "empresa"                                 │   │
│  │                                                           │   │
│  │  2. Busca tenant no banco                                 │   │
│  │     SELECT * FROM law_firms WHERE subdomain = 'empresa'   │   │
│  │                                                           │   │
│  │  3. Fornece contexto para toda a aplicação                │   │
│  │     <TenantContext.Provider value={tenant}>               │   │
│  │                                                           │   │
│  └───────────────────────┬──────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    useTenant()                            │   │
│  │                                                           │   │
│  │  Disponível em qualquer componente:                       │   │
│  │  - tenant.id         (UUID)                               │   │
│  │  - tenant.name       (Nome da empresa)                    │   │
│  │  - tenant.subdomain  (Subdomínio)                         │   │
│  │  - tenant.logoUrl    (Logo customizado)                   │   │
│  │  - isMainDomain      (boolean: se é domínio principal)    │   │
│  │  - isLoading         (boolean: carregando tenant)         │   │
│  │  - error             (string | null: erro de carregamento)│   │
│  │                                                           │   │
│  └───────────────────────┬──────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              COMPONENTES DA APLICAÇÃO                     │   │
│  │                                                           │   │
│  │  Todos os hooks e componentes utilizam:                   │   │
│  │  - const { tenant } = useTenant();                        │   │
│  │  - Filtram dados por law_firm_id = tenant.id              │   │
│  │                                                           │   │
│  │  Exemplo:                                                 │   │
│  │  const { data } = useQuery({                              │   │
│  │    queryKey: ['clients', tenant.id],                      │   │
│  │    queryFn: () => supabase                                │   │
│  │      .from('clients')                                     │   │
│  │      .select('*')                                         │   │
│  │      .eq('law_firm_id', tenant.id)                        │   │
│  │  });                                                      │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SUPABASE                                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 ROW LEVEL SECURITY                        │   │
│  │                                                           │   │
│  │  Políticas automáticas que garantem isolamento:           │   │
│  │                                                           │   │
│  │  CREATE POLICY "tenant_isolation" ON clients              │   │
│  │  FOR ALL                                                  │   │
│  │  USING (law_firm_id = get_user_law_firm_id(auth.uid()))   │   │
│  │                                                           │   │
│  │  → Usuário NUNCA consegue acessar dados de outro tenant   │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    EDGE FUNCTIONS                         │   │
│  │                                                           │   │
│  │  Funções serverless que também respeitam tenant:          │   │
│  │  - provision-company: Cria novo tenant                    │   │
│  │  - evolution-webhook: Recebe webhooks WhatsApp            │   │
│  │  - sync-n8n-prompt: Sincroniza prompts de IA              │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8️⃣ Checklist de Implementação

### Banco de Dados ✅
- [x] Adicionar coluna `subdomain` em `law_firms`
- [x] Criar índice para busca por subdomínio
- [x] Criar função `get_law_firm_by_subdomain`
- [x] RLS configurado em todas as tabelas

### Aplicação ✅
- [x] Criar hook `useTenant`
- [x] Criar `TenantProvider`
- [x] Implementar `extractSubdomain`
- [x] Implementar validação de subdomínio
- [x] Implementar geração automática de subdomínio
- [x] Simulação via query param em desenvolvimento

### Infraestrutura (Manual) ⏳
- [ ] Configurar DNS wildcard `*.miauchat.com.br`
- [ ] Configurar certificado SSL wildcard
- [ ] Configurar Nginx/Load Balancer
- [ ] Testar propagação DNS
- [ ] Testar SSL em subdomínios
- [ ] Configurar CDN (opcional)

### Onboarding ✅
- [x] Geração de subdomínio no signup
- [x] Verificação de disponibilidade
- [x] Edge function `provision-company`
- [ ] Wizard de configuração inicial (próximo passo)
- [ ] Página de erro para tenant não encontrado

---

## 9️⃣ Considerações de Segurança

### 9.1 Isolamento de Dados

| Camada | Mecanismo | Garantia |
|--------|-----------|----------|
| **Banco** | RLS (Row Level Security) | Dados filtrados por `law_firm_id` |
| **Aplicação** | TenantContext | Todas as queries incluem tenant |
| **Autenticação** | Validação de pertencimento | Usuário só acessa seu tenant |

### 9.2 Proteção contra Ataques

- **SQL Injection:** Uso de prepared statements e Supabase client
- **IDOR (Insecure Direct Object Reference):** RLS impede acesso a outros tenants
- **XSS:** React escapa automaticamente + CSP headers
- **CSRF:** SameSite cookies + tokens

### 9.3 Auditoria

```sql
-- Tabela de audit logs já implementada
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID,
    action TEXT,
    entity_type TEXT,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ
);
```

---

## 📞 Suporte

Para dúvidas sobre a implementação, entre em contato com a equipe técnica.

**Documentação atualizada em:** Dezembro 2024

---

## Anexo: Comandos Úteis

```bash
# Verificar DNS
dig +short empresa.miauchat.com.br

# Testar SSL
openssl s_client -connect empresa.miauchat.com.br:443 -servername empresa.miauchat.com.br

# Verificar certificado
echo | openssl s_client -servername empresa.miauchat.com.br -connect empresa.miauchat.com.br:443 2>/dev/null | openssl x509 -noout -text

# Testar nota SSL (online)
# https://www.ssllabs.com/ssltest/analyze.html?d=empresa.miauchat.com.br

# Listar todos os subdomínios ativos
SELECT subdomain, name FROM law_firms WHERE subdomain IS NOT NULL ORDER BY name;
```
