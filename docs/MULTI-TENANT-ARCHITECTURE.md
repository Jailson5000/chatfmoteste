# MiauChat - Arquitetura Multi-Tenant por Subdomínio

## 📋 Visão Geral

Este documento descreve a arquitetura técnica para implementação do modelo SaaS Multi-Tenant do MiauChat, utilizando subdomínios para isolamento de clientes.

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

### 2.1 Registro Wildcard

Para que todos os subdomínios funcionem automaticamente, configure um registro DNS wildcard:

#### Opção A: Registro A (Recomendado para IP fixo)

```
Tipo:   A
Nome:   *.miauchat.com.br
Valor:  [IP_DO_SERVIDOR]
TTL:    3600 (1 hora)
```

**Quando usar:**
- Servidor com IP fixo
- Infraestrutura própria
- VPS ou servidor dedicado

#### Opção B: Registro CNAME (Para CDN/Load Balancer)

```
Tipo:   CNAME
Nome:   *.miauchat.com.br
Valor:  lb.miauchat.com.br (ou endpoint do CDN)
TTL:    3600 (1 hora)
```

**Quando usar:**
- Cloudflare, AWS CloudFront, etc.
- Load Balancer
- Ambiente com IPs dinâmicos

### 2.2 Registros Essenciais

```
# Domínio principal
A       @                   [IP_SERVIDOR]
A       www                 [IP_SERVIDOR]

# Wildcard para subdomínios de clientes
A       *                   [IP_SERVIDOR]

# (Opcional) API separada
A       api                 [IP_API_SERVER]

# (Opcional) CDN para assets
CNAME   assets              cdn.provider.com
```

### 2.3 Verificação DNS

Após configurar, verifique a propagação:

```bash
# Verificar registro wildcard
dig +short teste.miauchat.com.br

# Ou use ferramentas online:
# https://dnschecker.org
# https://www.whatsmydns.net
```

**Tempo de propagação:** 15 minutos a 72 horas

---

## 3️⃣ Configuração SSL/HTTPS

### 3.1 Certificado Wildcard (Recomendado)

Um certificado wildcard cobre todos os subdomínios:

```
Domínios cobertos:
- *.miauchat.com.br
- miauchat.com.br
```

**Provedores recomendados:**
- Let's Encrypt (gratuito) - via Certbot
- Cloudflare (gratuito com plano gratuito)
- DigiCert, Sectigo (pagos, suporte enterprise)

### 3.2 Let's Encrypt com Certbot

```bash
# Instalação Certbot
sudo apt install certbot python3-certbot-nginx

# Gerar certificado wildcard (requer validação DNS)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d "miauchat.com.br" \
  -d "*.miauchat.com.br"

# Renovação automática
sudo certbot renew --dry-run
```

### 3.3 Cloudflare (Proxy com SSL automático)

Se usar Cloudflare como proxy:

1. Configure DNS no Cloudflare
2. Ative "Full (Strict)" SSL/TLS
3. Ative "Always Use HTTPS"
4. O certificado wildcard é automático

### 3.4 Nginx - Configuração SSL

```nginx
server {
    listen 443 ssl http2;
    server_name *.miauchat.com.br;

    ssl_certificate /etc/letsencrypt/live/miauchat.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/miauchat.com.br/privkey.pem;

    # Configurações de segurança
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 4️⃣ Fluxo de Criação de Novo Cliente

### 4.1 Processo de Onboarding

```
1. CADASTRO
   └── Cliente acessa: miauchat.com.br/signup
       └── Preenche: Nome da Empresa, Email, Senha
       
2. GERAÇÃO DE SUBDOMÍNIO
   └── Sistema gera subdomínio baseado no nome
   └── Ex: "FMO Advogados" → "fmo-advogados"
   └── Verifica disponibilidade
   
3. CRIAÇÃO NO BANCO
   └── Cria law_firm com subdomain definido
   └── Cria profile do admin
   └── Atribui role "admin"
   
4. CONFIGURAÇÃO INICIAL
   └── Redireciona para: fmo-advogados.miauchat.com.br
   └── Wizard de configuração inicial
   └── Upload de logo, configurações básicas
   
5. ACESSO CONTÍNUO
   └── Usuários acessam apenas via subdomínio
   └── Login isolado por tenant
```

### 4.2 Validação de Subdomínio

```typescript
// Regras de validação
- Mínimo 2 caracteres
- Máximo 63 caracteres
- Apenas letras minúsculas, números e hífens
- Não pode começar ou terminar com hífen
- Não pode ser reservado (www, api, admin, etc.)
- Deve ser único no sistema
```

### 4.3 Subdomínios Reservados

Os seguintes subdomínios são reservados e não podem ser usados por clientes:

```
www, api, app, admin, staging, dev, mail, smtp, 
ftp, cdn, assets, static, support, help, docs, blog
```

---

## 5️⃣ Ambientes (DEV / STAGING / PROD)

### 5.1 Estrutura de Ambientes

| Ambiente | URL Base | Banco | Propósito |
|----------|----------|-------|-----------|
| **Desenvolvimento** | localhost:5173 | Local/Dev | Desenvolvimento local |
| **Staging** | staging.miauchat.com.br | Staging DB | Testes e homologação |
| **Produção** | miauchat.com.br | Prod DB | Ambiente de produção |

### 5.2 Simulação em Desenvolvimento

Em ambiente local, subdomínios são simulados via query parameter:

```
http://localhost:5173?tenant=empresa
```

O sistema detecta automaticamente o ambiente e ajusta o comportamento.

### 5.3 Staging com Subdomínios

Para testar subdomínios em staging:

```
# Formato
empresa.staging.miauchat.com.br

# DNS
*.staging.miauchat.com.br → [IP_STAGING]
```

### 5.4 Variáveis de Ambiente

```bash
# .env.development
VITE_ENVIRONMENT=development
VITE_BASE_DOMAIN=localhost:5173

# .env.staging
VITE_ENVIRONMENT=staging
VITE_BASE_DOMAIN=staging.miauchat.com.br

# .env.production
VITE_ENVIRONMENT=production
VITE_BASE_DOMAIN=miauchat.com.br
```

---

## 6️⃣ Estrutura de Banco de Dados

### 6.1 Coluna de Subdomínio

```sql
-- Tabela law_firms
ALTER TABLE law_firms ADD COLUMN subdomain TEXT UNIQUE;

-- Índice para busca rápida
CREATE INDEX idx_law_firms_subdomain ON law_firms(subdomain);

-- Constraint de formato válido
ALTER TABLE law_firms ADD CONSTRAINT valid_subdomain_format 
CHECK (subdomain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
```

### 6.2 Função de Lookup

```sql
CREATE FUNCTION get_law_firm_by_subdomain(subdomain TEXT)
RETURNS UUID AS $$
  SELECT id FROM law_firms WHERE subdomain = $1
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

---

## 7️⃣ Arquitetura de Componentes

### 7.1 Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTE                               │
│                  empresa.miauchat.com.br                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    DNS WILDCARD                              │
│              *.miauchat.com.br → IP                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 LOAD BALANCER / NGINX                        │
│              SSL Wildcard Certificate                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   APLICAÇÃO REACT                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  TenantProvider                       │   │
│  │                                                       │   │
│  │  1. Extrai subdomínio da URL                         │   │
│  │  2. Busca tenant no banco                            │   │
│  │  3. Fornece contexto para app                        │   │
│  │                                                       │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    useTenant()                        │   │
│  │                                                       │   │
│  │  - tenant.id                                         │   │
│  │  - tenant.name                                       │   │
│  │  - tenant.subdomain                                  │   │
│  │  - tenant.logoUrl                                    │   │
│  │                                                       │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              COMPONENTES DA APLICAÇÃO                 │   │
│  │                                                       │   │
│  │  Todos os dados são filtrados por:                   │   │
│  │  law_firm_id = tenant.id                             │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       SUPABASE                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 ROW LEVEL SECURITY                    │   │
│  │                                                       │   │
│  │  Todas as tabelas filtradas por:                     │   │
│  │  law_firm_id = get_user_law_firm_id(auth.uid())     │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8️⃣ Checklist de Implementação

### Banco de Dados ✅
- [x] Adicionar coluna `subdomain` em `law_firms`
- [x] Criar índice para busca por subdomínio
- [x] Criar função `get_law_firm_by_subdomain`
- [x] Adicionar constraint de formato válido

### Aplicação ✅
- [x] Criar hook `useTenant`
- [x] Criar `TenantProvider`
- [x] Implementar `extractSubdomain`
- [x] Implementar validação de subdomínio
- [x] Implementar geração automática de subdomínio

### Infraestrutura (Manual) ⏳
- [ ] Configurar DNS wildcard `*.miauchat.com.br`
- [ ] Configurar certificado SSL wildcard
- [ ] Configurar Nginx/Load Balancer
- [ ] Testar propagação DNS
- [ ] Testar SSL em subdomínios

### Onboarding ⏳
- [ ] Integrar geração de subdomínio no signup
- [ ] Criar wizard de configuração inicial
- [ ] Implementar preview de subdomínio
- [ ] Adicionar página de erro para tenant não encontrado

---

## 9️⃣ Considerações de Segurança

### 9.1 Isolamento de Dados

- **RLS (Row Level Security)** garante isolamento no nível do banco
- Todas as queries são automaticamente filtradas por `law_firm_id`
- Usuários só podem acessar dados do seu tenant

### 9.2 Autenticação

- Login é isolado por tenant
- Usuário deve pertencer ao tenant para acessar
- Tokens JWT contêm informação do tenant

### 9.3 Validação de Subdomínio

- Subdomínios são validados no frontend e backend
- Subdomínios reservados são bloqueados
- Formato é validado via regex e constraint SQL

---

## 📞 Suporte

Para dúvidas sobre a implementação, entre em contato com a equipe técnica.

**Documentação atualizada em:** Dezembro 2024
