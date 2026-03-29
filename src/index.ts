/**
 * admin-service/src/index.ts
 *
 * Main entry point for the nfluencer admin Hono microservice.
 * Minimal version for initial deployment testing.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

interface Env {
  // Bindings
  DB: D1Database;
  STORAGE: R2Bucket;
  KV: KVNamespace;

  // Environment variables
  DOMAIN: string;
  DASHBOARD_ORIGIN: string;
  MAIN_APP_ORIGIN: string;

  // Secrets (set via wrangler secret put)
  CLERK_SECRET_KEY?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  RESEND_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS configuration
app.use("*", cors({
  origin: (origin, c) => {
    const allowedOrigins = [
      "http://localhost:5175", // Dashboard dev
      "https://dashboard.nfluencer.co", // Dashboard production
      "https://www.nfluencer.co", // Main app
      c.env?.DASHBOARD_ORIGIN,
      c.env?.MAIN_APP_ORIGIN
    ].filter(Boolean);
    
    return allowedOrigins.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Health check (no auth required)
app.get("/health", async (c) => {
  // Quick binding checks
  let dbOk = false;
  let kvOk = false;
  try { await c.env.DB.prepare("SELECT 1").first(); dbOk = true; } catch {}
  try { await c.env.KV.get("__health__"); kvOk = true; } catch {}

  return c.json({ 
    status: "ok", 
    version: "1.0.0", 
    service: "nfluencer-admin",
    timestamp: new Date().toISOString(),
    bindings: { db: dbOk, kv: kvOk, storage: !!c.env.STORAGE }
  });
});

// API v1 placeholder routes
app.get("/api/v1/admin/me", (c) => {
  return c.json({
    message: "Admin service is running", 
    endpoint: "/api/v1/admin/me",
    todo: "Authentication will be implemented next"
  });
});

app.get("/api/v1/admin/overview", (c) => {
  return c.json({
    message: "Admin service is running",
    endpoint: "/api/v1/admin/overview", 
    todo: "Dashboard metrics will be implemented next"
  });
});

// Catch-all for other admin routes
app.all("/api/v1/admin/*", (c) => {
  return c.json({
    message: "Admin endpoint placeholder",
    path: c.req.path,
    method: c.req.method,
    todo: "Full admin endpoints will be implemented in Phase 2"
  });
});

// Default 404
app.all("*", (c) => {
  return c.json({ error: "Not found", path: c.req.path }, 404);
});

export default app;
