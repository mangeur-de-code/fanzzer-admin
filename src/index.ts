/**
 * admin-service/src/index.ts
 *
 * Main entry point for the nfluencer admin Hono microservice.
 * All 29 admin endpoints are mounted under /api/v1/admin/*.
 */

import { Hono } from "hono";
import type { Env } from "./types";
import { applyCorsHeaders } from "./lib/utils";

// Route handlers
import { auditLogRoute } from "./routes/audit-log";
import { banUserRoute } from "./routes/ban-user";
import { clearCacheRoute } from "./routes/clear-cache";
import { contentRoute } from "./routes/content";
import { creatorsRoute } from "./routes/creators";
import { deleteUserRoute } from "./routes/delete-user";
import { dismissReportRoute } from "./routes/dismiss-report";
import { meRoute } from "./routes/me";
import { moderateContentRoute } from "./routes/moderate-content";
import { moderationRoute } from "./routes/moderation";
import { notificationsRoute } from "./routes/notifications";
import { overviewRoute } from "./routes/overview";
import { preferencesRoute } from "./routes/preferences";
import { promoteUserRoute } from "./routes/promote-user";
import { reportsRoute } from "./routes/reports";
import { resolveReportRoute } from "./routes/resolve-report";
import { revenueRoute } from "./routes/revenue";
import { searchRoute } from "./routes/search";
import { settingsRoute } from "./routes/settings";
import { streamsRoute } from "./routes/streams";
import { subscriptionsRoute } from "./routes/subscriptions";
import { systemRoute } from "./routes/system";
import { usersRoute } from "./routes/users";
import { verifyCreatorRoute } from "./routes/verify-creator";

type Variables = { adminUser: import("./lib/auth").AdminUser };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global OPTIONS preflight handler (handles all /api/v1/admin/* routes)
app.options("*", (c) => {
  applyCorsHeaders(c);
  return c.body(null, 204);
});

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "1.0.0", service: "nfluencer-admin" });
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
