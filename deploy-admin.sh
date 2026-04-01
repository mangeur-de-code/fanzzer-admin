#!/bin/bash
# deploy-admin.sh - Deploy fanzzer-admin microservice
set -e

echo "🔧 Building admin service..."
npm run build

echo "🚀 Deploying to production..."
npm run deploy:production

echo "✅ Admin service deployed!"
echo "🌐 Available at: https://fanzzer-admin.dlouis20.workers.dev"

# Test health check
echo "🔍 Testing health check..."
sleep 5
curl -f "https://fanzzer-admin.dlouis20.workers.dev/health" || echo "⚠️  Health check failed"

echo "🎉 Deployment complete!"