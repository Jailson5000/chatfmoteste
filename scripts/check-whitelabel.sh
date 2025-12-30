#!/bin/bash
# =====================================================
# MIAUCHAT - White Label Guard
# =====================================================
# Verifica se o build gerado mantém:
# - Title contendo "MiauChat"
# - Favicon apontando para /favicon.png
# - Nenhuma ocorrência de "Lovable" no bundle
#
# Uso: ./scripts/check-whitelabel.sh
# =====================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DIST_INDEX="dist/index.html"

if [ ! -f "$DIST_INDEX" ]; then
  echo -e "${RED}❌ dist/index.html não encontrado. Execute npm run build.${NC}"
  exit 1
fi

TITLE=$(grep -oP '(?<=<title>).*?(?=</title>)' "$DIST_INDEX" | head -n 1 || true)

if [ -z "$TITLE" ]; then
  echo -e "${RED}❌ Não foi possível ler o <title> do dist/index.html${NC}"
  exit 1
fi

if echo "$TITLE" | grep -qi "lovable"; then
  echo -e "${RED}❌ Title contém 'Lovable': ${TITLE}${NC}"
  exit 1
fi

if ! echo "$TITLE" | grep -qi "miauchat"; then
  echo -e "${RED}❌ Title não contém 'MiauChat': ${TITLE}${NC}"
  exit 1
fi

if ! grep -q 'rel="icon"' "$DIST_INDEX"; then
  echo -e "${RED}❌ Tag rel=icon não encontrada em dist/index.html${NC}"
  exit 1
fi

if ! grep -q 'href="/favicon.png"' "$DIST_INDEX"; then
  echo -e "${RED}❌ Favicon não aponta para /favicon.png em dist/index.html${NC}"
  exit 1
fi

# Procura referências indesejadas no dist (JS/CSS/HTML)
if grep -RIn "lovable" dist 2>/dev/null | head -n 20 | grep -q .; then
  echo -e "${RED}❌ Encontrado 'lovable' no bundle (dist). Bloqueando deploy.${NC}"
  echo -e "${YELLOW}Trechos encontrados:${NC}"
  grep -RIn "lovable" dist 2>/dev/null | head -n 20 || true
  exit 1
fi

echo -e "${GREEN}✅ White label OK: title e favicon corretos; sem referências a Lovable no dist.${NC}"
