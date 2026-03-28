/**
 * admin-service/src/routes/dismiss-report.ts
 *
 * POST /api/v1/admin/dismiss-report
 * Marks a user report as dismissed and logs the action.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const dismissReportRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

dismissReportRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const body = await c.req.json<{ reportId?: number; reason?: string }>();
  const { reportId, reason } = body;

  if (!reportId) return corsJson(c, { error: "Report ID is required" }, 400);

  const report = await c.env.DB
    .prepare("SELECT * FROM reports WHERE id = ?")
    .bind(reportId)
    .first<{ id: number; reporter_id: number; reported_user_id: number; reason: string }>();

  if (!report) return corsJson(c, { error: "Report not found" }, 404);

  await c.env.DB
    .prepare("UPDATE reports SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(reportId)
    .run();

  await c.env.DB
    .prepare(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'report_dismissed', 'report', ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      user.id,
      reportId,
      JSON.stringify({
        reason: reason || "Dismissed by admin",
        reporter_id: report.reporter_id,
        reported_user_id: report.reported_user_id,
        original_reason: report.reason,
      })
    )
    .run();

  return corsJson(c, { success: true, message: "Report dismissed successfully" });
});
