/**
 * admin-service/src/index.ts
 *
 * Main entry point for the nfluencer admin Hono microservice.
 * Minimal version for initial deployment testing.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

interface Env {
  // Bindings (wrangler.toml)
  DB: D1Database;
  STORAGE: R2Bucket;
  KV: KVNamespace;
  NOTIFY_QUEUE: Queue;

  // Environment variables
  DOMAIN: string;
  DASHBOARD_ORIGIN: string;
  MAIN_APP_ORIGIN: string;

  // Secrets (set via wrangler secret put)
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
  RESEND_API_KEY: string;
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
app.get("/health", (c) => {
  return c.json({ 
    status: "ok", 
    version: "1.0.0", 
    service: "nfluencer-admin",
    timestamp: new Date().toISOString()
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
});

// Mount all admin routes under /api/v1/admin
const v1 = app.basePath("/api/v1/admin");

v1.route("/audit-log", auditLogRoute);
v1.route("/ban-user", banUserRoute);
v1.route("/clear-cache", clearCacheRoute);
v1.route("/content", contentRoute);
v1.route("/creators", creatorsRoute);
v1.route("/delete-user", deleteUserRoute);
v1.route("/dismiss-report", dismissReportRoute);
v1.route("/me", meRoute);
v1.route("/moderate-content", moderateContentRoute);
v1.route("/moderation", moderationRoute);
v1.route("/notifications", notificationsRoute);
v1.route("/overview", overviewRoute);
v1.route("/preferences", preferencesRoute);
v1.route("/promote-user", promoteUserRoute);
v1.route("/reports", reportsRoute);
v1.route("/resolve-report", resolveReportRoute);
v1.route("/revenue", revenueRoute);
v1.route("/search", searchRoute);
v1.route("/settings", settingsRoute);
v1.route("/streams", streamsRoute);
v1.route("/subscriptions", subscriptionsRoute);
v1.route("/system", systemRoute);
v1.route("/users", usersRoute);
v1.route("/verify-creator", verifyCreatorRoute);

export default app;
