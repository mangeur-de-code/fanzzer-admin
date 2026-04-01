# Fanzzer Admin Setup Guide

## Option 3: Direct Wrangler Deployment Setup

### 1. Remove GitHub Actions (✅ Complete)
The `.github` directory has been removed from the fanzzer-admin project.

### 2. Configure Required Secrets

The admin service needs these secrets to function properly:

```bash
# Navigate to admin service directory
cd "C:\Users\dloui\Documents\fanzzer-admin"

# Set each secret (you'll need to get values from main app)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_PUBLISHABLE_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_STREAM_API_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler secret put MEDIA_TOKEN_SECRET
npx wrangler secret put CLERK_WEBHOOK_SECRET
```

### 3. Deploy Admin Service

**PowerShell (Windows):**
```powershell
.\deploy-admin.ps1
# Or for production:
.\deploy-admin.ps1 -Production
```

**Bash (Linux/Mac):**
```bash
./deploy-admin.sh
# Or for production:
./deploy-admin.sh --production
```

### 4. Test Deployment

After deployment, test the admin service:

1. **Health Check:**
   ```
   https://fanzzer-admin.dlouis20.workers.dev/health
   ```

2. **Admin API Test:**
   ```
   https://fanzzer-admin.dlouis20.workers.dev/api/users
   ```

### 5. Update Dashboard Configuration

Update the dashboard to use the new admin service URL:

```typescript
// In fanzzer-dashboard project
// Update API_BASE_URL to: https://fanzzer-admin.dlouis20.workers.dev
```

## Current Status

✅ GitHub Actions removed
✅ Deployment scripts created  
✅ TypeScript errors fixed
✅ Service deployed successfully
✅ Zero Trust protection active
⚠️ Additional secrets may be needed for full functionality

## Deployment Results

- **Service URL:** https://fanzzer-admin.dlouis20.workers.dev
- **Status:** Successfully deployed and secured
- **Protection:** Cloudflare Zero Trust Access enabled
- **Bindings:** All resources properly configured (DB, KV, Queue, R2)

## Security Note

The admin service is properly protected by Cloudflare Zero Trust Access. This means:
- All endpoints require authentication via the configured identity providers
- Direct API testing requires authenticated access through the Zero Trust portal
- This is the correct and secure configuration for production admin services

## Testing Authenticated Access

1. **Access the admin service:**
   ```
   https://fanzzer-admin.dlouis20.workers.dev
   ```
   
2. **Authenticate** through the Zero Trust login page

3. **Test endpoints** after authentication:
   - Health: `/health`
   - Users: `/api/users`  
   - Analytics: `/api/analytics`

## Next Steps

1. Configure the missing secrets listed above
2. Run the deployment script
3. Test the admin API endpoints
4. Update dashboard configuration
5. Test cross-service communication

## Troubleshooting

- **CORS Issues:** The admin service is configured for fanzzer.co domains
- **Health Check:** Should return 200 OK with service status
- **Secrets:** Use `npx wrangler secret list` to verify configuration