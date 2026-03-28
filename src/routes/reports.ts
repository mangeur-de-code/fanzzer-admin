/**
 * admin-service/src/routes/reports.ts
 *
 * GET /api/v1/admin/reports
 * Returns user reports filtered by date range and optional status.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const reportsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

reportsRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const statusFilter = new URL(c.req.url).searchParams.get("status") || "all";
  const db = c.env.DB;

  let query = `
    SELECT 
      r.id,
      r.reporter_id,
      r.reported_user_id,
      COALESCE(reporter.display_name, reporter.username, reporter.email) as reporter_name,
      COALESCE(reported.display_name, reported.username, reported.email) as reported_name,
      r.reason,
      r.description,
      r.status,
      r.created_at
    FROM reports r
    LEFT JOIN users reporter ON r.reporter_id = reporter.id
    LEFT JOIN users reported ON r.reported_user_id = reported.id
    WHERE r.created_at >= ? AND r.created_at <= ?
  `;

  const params: Array<string | number | null> = [range.start, range.end];
  if (statusFilter !== "all") {
    query += " AND r.status = ?";
    params.push(statusFilter);
  }
  query += " ORDER BY r.created_at DESC LIMIT 100";

  const reports = await safeAll(db, query, params);

  return corsJson(c, { range, reports: reports || [] });
});
