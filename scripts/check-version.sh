#!/bin/bash
# =====================================================
# MIAUCHAT - Script de Verificação de Versão do VPS
# =====================================================
# Este script verifica se a versão no VPS está sincronizada
# com o repositório GitHub.
#
# Uso: ./scripts/check-version.sh
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     MIAUCHAT - Verificação de Versão do VPS       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Configuration
VPS_URL="${VPS_URL:-https://miauchat.com.br}"
BUILD_INFO_FILE="src/lib/buildInfo.ts"

# Extract local build ID from source
echo -e "${YELLOW}📁 Lendo versão local do código...${NC}"
if [ -f "$BUILD_INFO_FILE" ]; then
    LOCAL_BUILD_ID=$(grep -oP 'APP_BUILD_ID = "\K[^"]+' "$BUILD_INFO_FILE" 2>/dev/null || echo "not-found")
    LOCAL_TIMESTAMP=$(grep -oP 'APP_BUILD_TIMESTAMP = "\K[^"]+' "$BUILD_INFO_FILE" 2>/dev/null || echo "not-found")
else
    LOCAL_BUILD_ID="file-not-found"
    LOCAL_TIMESTAMP="file-not-found"
fi

echo -e "   Build ID Local: ${GREEN}${LOCAL_BUILD_ID}${NC}"
echo -e "   Timestamp Local: ${GREEN}${LOCAL_TIMESTAMP}${NC}"
echo ""

# Check Git status
echo -e "${YELLOW}📊 Verificando status do Git...${NC}"
if command -v git &> /dev/null && [ -d ".git" ]; then
    GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    GIT_STATUS=$(git status --porcelain 2>/dev/null | wc -l)
    
    echo -e "   Branch: ${GREEN}${GIT_BRANCH}${NC}"
    echo -e "   Commit: ${GREEN}${GIT_COMMIT}${NC}"
    
    if [ "$GIT_STATUS" -gt 0 ]; then
        echo -e "   Status: ${RED}${GIT_STATUS} arquivo(s) modificado(s)${NC}"
    else
        echo -e "   Status: ${GREEN}Limpo (sem alterações pendentes)${NC}"
    fi
    
    # Check if local is behind remote
    git fetch origin --quiet 2>/dev/null || true
    BEHIND=$(git rev-list HEAD..origin/${GIT_BRANCH} --count 2>/dev/null || echo "0")
    AHEAD=$(git rev-list origin/${GIT_BRANCH}..HEAD --count 2>/dev/null || echo "0")
    
    if [ "$BEHIND" -gt 0 ]; then
        echo -e "   Sync: ${RED}${BEHIND} commit(s) atrás do remoto${NC}"
    elif [ "$AHEAD" -gt 0 ]; then
        echo -e "   Sync: ${YELLOW}${AHEAD} commit(s) à frente do remoto${NC}"
    else
        echo -e "   Sync: ${GREEN}Sincronizado com o remoto${NC}"
    fi
else
    echo -e "   ${RED}Git não disponível ou não é um repositório${NC}"
fi
echo ""

# Check VPS version (if accessible)
echo -e "${YELLOW}🌐 Verificando versão no VPS (${VPS_URL})...${NC}"

# Try to fetch the built JS and extract version (this is a basic check)
VPS_ACCESSIBLE=false
if command -v curl &> /dev/null; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${VPS_URL}" 2>/dev/null || echo "000")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        VPS_ACCESSIBLE=true
        echo -e "   Status HTTP: ${GREEN}${HTTP_STATUS} OK${NC}"
        
        # Try to get the build info from the page source
        VPS_HTML=$(curl -s --max-time 10 "${VPS_URL}" 2>/dev/null || echo "")

        VPS_TITLE=$(echo "$VPS_HTML" | grep -oP '(?<=<title>).*?(?=</title>)' | head -n 1 || echo "")
        if [ -n "$VPS_TITLE" ]; then
            if echo "$VPS_TITLE" | grep -qi "lovable"; then
                echo -e "   Title: ${RED}${VPS_TITLE}${NC}"
                echo -e "   ${RED}❌ Branding incorreto detectado (Lovable) — provável build antigo no VPS${NC}"
            elif echo "$VPS_TITLE" | grep -qi "miauchat"; then
                echo -e "   Title: ${GREEN}${VPS_TITLE}${NC}"
            else
                echo -e "   Title: ${YELLOW}${VPS_TITLE}${NC}"
            fi
        else
            echo -e "   Title: ${YELLOW}não detectado${NC}"
        fi

        if echo "$VPS_HTML" | grep -q 'href="/favicon.png"'; then
            echo -e "   Favicon: ${GREEN}/favicon.png${NC}"
        else
            echo -e "   Favicon: ${YELLOW}não confirmado no HTML${NC}"
        fi

        if echo "$VPS_HTML" | grep -q "MiauChat"; then
            echo -e "   Conteúdo: ${GREEN}MiauChat detectado${NC}"
        else
            echo -e "   Conteúdo: ${YELLOW}Página carregada (verificar manualmente)${NC}"
        fi
    else
        echo -e "   Status HTTP: ${RED}${HTTP_STATUS} - VPS pode estar offline${NC}"
    fi
else
    echo -e "   ${YELLOW}curl não disponível - pulando verificação de VPS${NC}"
fi
echo ""

# Check dist folder (if on VPS)
echo -e "${YELLOW}📦 Verificando pasta dist...${NC}"
if [ -d "dist" ]; then
    DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
    DIST_FILES=$(find dist -type f 2>/dev/null | wc -l)
    DIST_MODIFIED=$(stat -c %y dist 2>/dev/null | cut -d'.' -f1 || stat -f %Sm dist 2>/dev/null || echo "unknown")
    
    echo -e "   Tamanho: ${GREEN}${DIST_SIZE}${NC}"
    echo -e "   Arquivos: ${GREEN}${DIST_FILES}${NC}"
    echo -e "   Última modificação: ${GREEN}${DIST_MODIFIED}${NC}"
else
    echo -e "   ${YELLOW}Pasta dist não encontrada (executar npm run build)${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    RESUMO                          ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"

# Determine status
ALL_OK=true

if [ "$GIT_STATUS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Existem alterações locais não commitadas${NC}"
    ALL_OK=false
fi

if [ "$BEHIND" -gt 0 ]; then
    echo -e "${RED}❌ VPS está ${BEHIND} commit(s) atrás do GitHub${NC}"
    echo -e "   ${YELLOW}Execute: git pull && npm run build${NC}"
    ALL_OK=false
fi

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build não encontrado${NC}"
    echo -e "   ${YELLOW}Execute: npm run build${NC}"
    ALL_OK=false
fi

if $ALL_OK; then
    echo -e "${GREEN}✅ VPS aparenta estar atualizado!${NC}"
    echo -e "${GREEN}   Build ID: ${LOCAL_BUILD_ID}${NC}"
fi

echo ""
echo -e "${BLUE}Para atualizar o VPS, execute:${NC}"
echo -e "   ${YELLOW}./deploy.sh${NC}"
echo ""
