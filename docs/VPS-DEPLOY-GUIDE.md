# Guia de Deploy - MiauChat VPS

## Arquitetura Híbrida

```
┌─────────────────────────────────────────────────────────────┐
│                      PRODUÇÃO                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │   SEU VPS        │         │   LOVABLE CLOUD          │  │
│  │                  │         │   (Supabase)             │  │
│  │  Frontend        │◄───────►│  - Database              │  │
│  │  (React/Vite)    │  HTTPS  │  - Auth                  │  │
│  │                  │         │  - Edge Functions        │  │
│  │  miauchat.com.br │         │  - Storage               │  │
│  └──────────────────┘         └──────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 1. Variáveis de Ambiente para Build

Crie um arquivo `.env.production` no VPS antes do build:

```bash
# Supabase Configuration (OBRIGATÓRIO)
VITE_SUPABASE_URL=https://jiragtersejnarxruqyd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcmFndGVyc2VqbmFyeHJ1cXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzI2MTUsImV4cCI6MjA4MjAwODYxNX0.pt4s9pS-Isi-Y3uRQG68njQIX1QytgIP5cnpEv_wr_M
VITE_SUPABASE_PROJECT_ID=jiragtersejnarxruqyd

# Environment
VITE_ENVIRONMENT=production
VITE_BASE_DOMAIN=miauchat.com.br
```

## 2. Comandos de Build

```bash
# Clone ou atualize o repositório
git pull origin main

# Instale dependências
npm install

# Build de produção
npm run build

# Os arquivos estarão em ./dist/
```

## 3. Configuração do Nginx

```nginx
# /etc/nginx/sites-available/miauchat.com.br

server {
    listen 80;
    server_name miauchat.com.br www.miauchat.com.br *.miauchat.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name miauchat.com.br www.miauchat.com.br;
    
    # SSL (Let's Encrypt - Wildcard)
    ssl_certificate /etc/letsencrypt/live/miauchat.com.br-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/miauchat.com.br-0001/privkey.pem;
    
    # Configurações SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    
    # Root do frontend
    root /var/www/miauchat/dist;
    index index.html;
    
    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;
    
    # Cache de assets estáticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # SPA - todas as rotas vão para index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}

# Configuração para subdomínios (multi-tenant)
server {
    listen 443 ssl http2;
    server_name *.miauchat.com.br;
    
    ssl_certificate /etc/letsencrypt/live/miauchat.com.br-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/miauchat.com.br-0001/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    
    root /var/www/miauchat/dist;
    index index.html;
    
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 4. Configuração de Auth no Backend

As seguintes URLs de redirecionamento precisam ser adicionadas no Lovable Cloud:

- `https://miauchat.com.br`
- `https://miauchat.com.br/`
- `https://miauchat.com.br/dashboard`
- `https://miauchat.com.br/reset-password`
- `https://www.miauchat.com.br`
- `https://www.miauchat.com.br/`
- `https://www.miauchat.com.br/dashboard`

**Site URL**: `https://miauchat.com.br`

## 5. SSL/HTTPS com Let's Encrypt

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Gerar certificado wildcard (para subdomínios)
sudo certbot certonly --manual --preferred-challenges=dns \
  -d miauchat.com.br -d "*.miauchat.com.br"

# OU certificado simples (sem wildcard)
sudo certbot --nginx -d miauchat.com.br -d www.miauchat.com.br

# Renovação automática
sudo crontab -e
# Adicionar:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 6. Script de Deploy

Crie um script `deploy.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 Iniciando deploy do MiauChat..."

# Diretório do projeto
cd /var/www/miauchat

# Atualizar código
echo "📥 Atualizando código..."
git pull origin main

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Build
echo "🔨 Executando build..."
npm run build

# Copiar para diretório do Nginx (se diferente)
# cp -r dist/* /var/www/miauchat/dist/

# Reiniciar Nginx
echo "🔄 Reiniciando Nginx..."
sudo systemctl reload nginx

echo "✅ Deploy concluído!"
echo "🌐 Acesse: https://miauchat.com.br"
```

## 7. Checklist Pré-Deploy

- [ ] Variáveis de ambiente configuradas (`.env.production`)
- [ ] SSL/HTTPS configurado
- [ ] Nginx configurado e testado
- [ ] DNS apontando para o VPS
- [ ] Redirect URLs adicionadas no Lovable Cloud
- [ ] Testar login/signup
- [ ] Testar chamadas às Edge Functions
- [ ] Testar RLS (leitura/escrita no banco)

## 8. Troubleshooting

### Erro de CORS
- Verifique se o domínio está na lista `ALLOWED_ORIGINS` das Edge Functions
- Confirme que está usando HTTPS

### Login não funciona
- Verifique se o Site URL e Redirect URLs estão configurados no Lovable Cloud
- Confirme que as variáveis `VITE_SUPABASE_*` estão corretas

### Página em branco
- Verifique se o Nginx está servindo os arquivos do `dist/`
- Confirme que `try_files` está configurado para SPA

### Subdomínios não funcionam
- Verifique DNS wildcard: `*.miauchat.com.br → IP do VPS`
- Confirme SSL wildcard configurado

## Arquivos Modificados

| Arquivo | Descrição |
|---------|-----------|
| `src/lib/production-config.ts` | Configurações centralizadas de produção |
| `supabase/functions/_shared/cors.ts` | CORS headers compartilhados |
| `supabase/functions/*/index.ts` | CORS atualizado em todas as funções |
| `docs/VPS-DEPLOY-GUIDE.md` | Este guia |
