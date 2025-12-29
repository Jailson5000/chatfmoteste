# MiauChat - Plataforma de Comunicação

Multiplataforma de Inteligência Artificial Unificada para gestão de atendimento multicanal.

## 🚀 Sobre o Projeto

MiauChat é uma plataforma SaaS multi-tenant para centralizar comunicações, automatizar conversas com IA e gerenciar atendimentos de forma profissional.

## 🛠️ Tecnologias

- **Frontend**: React + Vite + TypeScript
- **Estilização**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Database, Edge Functions, Storage)
- **Estado**: TanStack Query
- **Roteamento**: React Router

## 📦 Instalação Local

```bash
# Clone o repositório
git clone <YOUR_GIT_URL>

# Navegue até o diretório
cd miauchat

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

## 🌐 Deploy em Produção

### VPS (miauchat.com.br)

```bash
# No servidor VPS
cd /var/www/miauchat

# Atualizar código
git pull origin main

# Instalar dependências
npm install

# Build de produção
npm run build

# Recarregar Nginx
sudo systemctl reload nginx
```

Veja `deploy.sh` para script automatizado de deploy.

### Configuração de Domínio

O projeto está configurado para:
- `https://miauchat.com.br`
- `https://www.miauchat.com.br`
- Subdomínios de clientes: `*.miauchat.com.br`

## 🔐 Configuração de Autenticação

### Redirect URLs Necessárias no Supabase

Para o login funcionar corretamente em produção, configure no Supabase Dashboard:

**Site URL:**
```
https://www.miauchat.com.br
```

**Redirect URLs (adicionar todas):**
```
https://miauchat.com.br/**
https://www.miauchat.com.br/**
https://*.miauchat.com.br/**
```

## 📁 Estrutura do Projeto

```
├── public/              # Assets públicos (favicon, etc.)
├── src/
│   ├── assets/          # Imagens e recursos
│   ├── components/      # Componentes React
│   ├── hooks/           # Custom hooks
│   ├── integrations/    # Integrações (Supabase)
│   ├── pages/           # Páginas da aplicação
│   └── lib/             # Utilitários
├── supabase/
│   └── functions/       # Edge Functions
└── docs/                # Documentação
```

## 📞 Suporte

Para dúvidas ou suporte, entre em contato com a equipe MiauChat.

---

© 2025 MiauChat. Todos os direitos reservados.
