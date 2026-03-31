# fanzzer Admin Service

Admin API microservice for the fanzzer.co creator monetization platform.

## Architecture

- **Framework**: Hono.js on Cloudflare Workers
- **Database**: Cloudflare D1 (shared with main app)
- **Storage**: Cloudflare R2 (shared)
- **Authentication**: Clerk (planned)
- **Deployment**: Cloudflare Workers

## API Endpoints

### Health Check
- `GET /health` - Service health and binding status

### Admin APIs (v1)
- `GET /api/v1/admin/me` - Admin user info
- `GET /api/v1/admin/overview` - Dashboard overview data
- `GET /api/v1/admin/users` - User management
- `GET /api/v1/admin/moderation` - Content moderation
- More endpoints available (see service root for full list)

### Dashboard Compatible APIs
- `GET /api/admin/*` - Dashboard-compatible endpoints without version prefix

## Development

```bash
# Install dependencies
npm install

# Run locally  
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

## Environment Variables

Configure in Cloudflare Workers dashboard:

- `DOMAIN` - Main domain (fanzzer.co)
- `DASHBOARD_ORIGIN` - Dashboard URL for CORS
- `MAIN_APP_ORIGIN` - Main app URL for CORS

## Resource Bindings

- `DB` - D1 Database (creator-platform-production-database)
- `STORAGE` - R2 Bucket (creator-platform-production-bucket)  
- `KV` - KV Namespace (shared with main app)
- `NOTIFY_QUEUE` - Queue for notifications

## Deployment

Automated via GitHub Actions on push to main branch.

Manual deployment:
```bash
npx wrangler deploy --config wrangler.toml
```

## Live Service

- **Production**: https://fanzzer-admin.dlouis20.workers.dev
- **Health Check**: https://fanzzer-admin.dlouis20.workers.dev/health
- **API Documentation**: https://fanzzer-admin.dlouis20.workers.dev/