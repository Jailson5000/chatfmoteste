#!/bin/bash

# =====================================================
# MIAUCHAT - Script de Deploy para VPS
# =====================================================
# Uso: ./deploy.sh
# =====================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          MIAUCHAT - Deploy para VPS                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Navigate to project directory
cd /var/www/miauchat

# Show current version before update
echo -e "${YELLOW}📋 Versão atual:${NC}"
if [ -f "src/lib/buildInfo.ts" ]; then
    CURRENT_BUILD=$(grep -oP 'APP_BUILD_ID = "\K[^"]+' src/lib/buildInfo.ts 2>/dev/null || echo "unknown")
    echo -e "   Build ID: ${GREEN}${CURRENT_BUILD}${NC}"
fi
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo -e "   Commit: ${GREEN}${CURRENT_COMMIT}${NC}"
echo ""

# Pull latest changes
echo -e "${YELLOW}📥 Baixando últimas alterações do GitHub...${NC}"
git fetch origin
BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")

if [ "$BEHIND" -eq 0 ]; then
    echo -e "${GREEN}   ✅ Já está atualizado!${NC}"
else
    echo -e "   ${YELLOW}${BEHIND} commit(s) para baixar${NC}"
    git pull origin main
fi
echo ""

# Install dependencies
echo -e "${YELLOW}📦 Verificando dependências...${NC}"
npm install --silent
echo -e "${GREEN}   ✅ Dependências atualizadas${NC}"
echo ""

# Build application
echo -e "${YELLOW}🔨 Compilando aplicação...${NC}"
npm run build
echo -e "${GREEN}   ✅ Build concluído${NC}"
echo ""

# Reload Nginx
echo -e "${YELLOW}🔄 Recarregando Nginx...${NC}"
sudo systemctl reload nginx
echo -e "${GREEN}   ✅ Nginx recarregado${NC}"
echo ""

# Show new version after update
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}📋 Nova versão:${NC}"
if [ -f "src/lib/buildInfo.ts" ]; then
    NEW_BUILD=$(grep -oP 'APP_BUILD_ID = "\K[^"]+' src/lib/buildInfo.ts 2>/dev/null || echo "unknown")
    echo -e "   Build ID: ${GREEN}${NEW_BUILD}${NC}"
fi
NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo -e "   Commit: ${GREEN}${NEW_COMMIT}${NC}"
echo ""

echo -e "${BLUE}🌐 Acesse: https://miauchat.com.br${NC}"
echo ""

# Optional: Run version check
if [ -f "scripts/check-version.sh" ]; then
    echo -e "${YELLOW}Executando verificação completa...${NC}"
    echo ""
    chmod +x scripts/check-version.sh
    ./scripts/check-version.sh
fi
