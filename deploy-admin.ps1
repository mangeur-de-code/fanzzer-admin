# deploy-admin.ps1 - Deploy fanzzer-admin microservice
param(
    [switch]$Production = $false
)

Write-Host "🔧 Building admin service..." -ForegroundColor Blue
npm run build

if ($Production) {
    Write-Host "🚀 Deploying to production..." -ForegroundColor Yellow
    npm run deploy:production
} else {
    Write-Host "🚀 Deploying to development..." -ForegroundColor Yellow  
    npm run deploy
}

Write-Host "✅ Admin service deployed!" -ForegroundColor Green
Write-Host "🌐 Available at: https://fanzzer-admin.dlouis20.workers.dev" -ForegroundColor Cyan

# Test health check
Write-Host "🔍 Testing health check..." -ForegroundColor Blue
Start-Sleep -Seconds 5

try {
    $response = Invoke-WebRequest -Uri "https://fanzzer-admin.dlouis20.workers.dev/health" -Method GET
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Health check passed!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "🎉 Deployment complete!" -ForegroundColor Green