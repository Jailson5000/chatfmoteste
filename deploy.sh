#!/bin/bash

# Script de deploy para VPS MiauChat
# Uso: ./deploy.sh

set -e

echo "🚀 Iniciando deploy do MiauChat..."

cd /var/www/miauchat

echo "📥 Baixando últimas alterações..."
git pull origin main

echo "📦 Instalando dependências..."
npm install

echo "🔨 Buildando aplicação..."
npm run build

echo "🔄 Recarregando Nginx..."
sudo systemctl reload nginx

echo "✅ Deploy concluído com sucesso!"
echo "🌐 Acesse: https://miauchat.com.br"
