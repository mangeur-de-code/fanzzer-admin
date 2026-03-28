/**
 * admin-service/src/routes/resolve-report.ts
 *
 * POST /api/v1/admin/resolve-report
 * Resolves a user report and notifies the reporter via email.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, sendEmail } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const resolveReportRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

resolveReportRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const body = await c.req.json<{ reportId?: number; resolution?: string; reason?: string }>();
  const { reportId, resolution = "dismissed", reason = "" } = body;

  if (!reportId) return corsJson(c, { error: "Report ID required" }, 400);

  const report = await c.env.DB
    .prepare(
      `SELECT r.id, r.reporter_id, r.reported_user_id, r.reason as report_reason,
              u1.email as reporter_email, u2.email as reported_email, u2.username,
              COALESCE(u1.display_name, u1.username, 'User') as reporter_name
       FROM reports r
       JOIN users u1 ON r.reporter_id = u1.id
       JOIN users u2 ON r.reported_user_id = u2.id
       WHERE r.id = ?`
    )
    .bind(reportId)
    .first<{
      id: number;
      reporter_id: number;
      reporter_email: string;
      report_reason: string;
      username: string;
      reporter_name: string;
    }>();

  if (!report) return corsJson(c, { error: "Report not found" }, 404);

  await c.env.DB
    .prepare("UPDATE reports SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(reportId)
    .run();

  await c.env.DB
    .prepare(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, target_username, details, created_at)
       VALUES (?, 'report_resolved', 'report', ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(user.id, reportId, report.username, JSON.stringify({ resolution, reason }))
    .run();

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const to = c.env.ENVIRONMENT === "production" ? report.reporter_email : "onboarding@resend.dev";
        const resolutionText =
          resolution === "dismissed"
            ? "After review, no action was taken at this time."
            : `The reported content has been reviewed and appropriate action (${resolution}) has been taken.`;

        await sendEmail(
          {
            to,
            subject: "Your report has been reviewed - nfluencer",
            html: `<p>Hi ${report.reporter_name},</p>
                   <p>Your report regarding "${report.report_reason || "content"}" has been reviewed.</p>
                   <p>${resolutionText}</p>`,
          },
          c.env.RESEND_API_KEY
        );
      } catch (err) {
        console.error("[resolve-report] Email error:", err);
      }
    })()
  );

  return corsJson(c, { success: true, message: "Report resolved successfully" });
});
