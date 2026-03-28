/**
 * admin-service/src/types.ts
 *
 * Cloudflare Worker bindings type definition for the admin microservice.
 * Mirrors the relevant secrets and bindings from the main app's worker-configuration.d.ts.
 */

export interface Env {
  // Bindings (wrangler.toml)
  DB: D1Database;
  STORAGE: R2Bucket;
  KV: KVNamespace;

  // Secrets
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
  RESEND_API_KEY: string;

  // Vars
  ENVIRONMENT?: "development" | "production";
  DASHBOARD_ORIGIN?: string;
  ADMIN_ALLOWED_ORIGINS?: string;
}
