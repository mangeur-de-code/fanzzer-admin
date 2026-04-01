# copy-secrets.ps1 - Copy secrets from main app to fanzzer-admin
Write-Host "🔐 Copying secrets from main app to fanzzer-admin..." -ForegroundColor Blue

# Essential secrets needed by admin service
$secrets = @(
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY", 
    "STRIPE_WEBHOOK_SECRET",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_STREAM_API_TOKEN",
    "SESSION_SECRET",
    "MEDIA_TOKEN_SECRET",
    "CLERK_WEBHOOK_SECRET"
)

$mainAppPath = "C:\Users\dloui\Documents\react-router-starter-template"
$adminPath = "C:\Users\dloui\Documents\fanzzer-admin"

foreach ($secret in $secrets) {
    Write-Host "📋 Processing $secret..." -ForegroundColor Yellow
    
    try {
        # Get secret from main app
        cd $mainAppPath
        $value = npx wrangler secret get $secret 2>$null
        
        if ($LASTEXITCODE -eq 0 -and $value) {
            # Set secret in admin service
            cd $adminPath
            echo $value | npx wrangler secret put $secret
            Write-Host "✅ Copied $secret" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Could not retrieve $secret from main app" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Failed to copy $secret`: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "🎉 Secret migration complete!" -ForegroundColor Green
cd $adminPath