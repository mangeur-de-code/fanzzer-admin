/**
 * admin-service/src/routes/moderate-content.ts
 *
 * POST /api/v1/admin/moderate-content
 * Approve, reject, or delete a piece of content and notify the creator.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, sendEmail } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const moderateContentRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

moderateContentRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const body = await c.req.json<{
    contentId?: number;
    action?: "approve" | "reject" | "delete";
    reason?: string;
  }>();
  const { contentId, action: actionType, reason = "" } = body;

  if (!contentId || !actionType) return corsJson(c, { error: "Content ID and action required" }, 400);
  if (!["approve", "reject", "delete"].includes(actionType)) return corsJson(c, { error: "Invalid action" }, 400);

  const content = await c.env.DB
    .prepare(
      `SELECT c.id, c.title, c.creator_id, c.status, u.username, u.email
       FROM content c
       JOIN users u ON c.creator_id = u.id
       WHERE c.id = ?`
    )
    .bind(contentId)
    .first<{ id: number; title: string; creator_id: number; status: string; username: string; email: string }>();

  if (!content) return corsJson(c, { error: "Content not found" }, 404);

  const newStatus = actionType === "approve" ? "published" : actionType === "reject" ? "rejected" : "deleted";

  await c.env.DB
    .prepare("UPDATE content SET status = ?, flagged = 0 WHERE id = ?")
    .bind(newStatus, contentId)
    .run();

  await c.env.DB
    .prepare(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, target_username, details, created_at)
       VALUES (?, ?, 'content', ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      user.id,
      `content_${actionType === "approve" ? "approved" : "removed"}`,
      contentId,
      content.username,
      reason
    )
    .run();

  if (actionType !== "approve") {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const to = c.env.ENVIRONMENT === "production" ? content.email : "onboarding@resend.dev";
          await sendEmail(
            {
              to,
              subject: "Your content has been removed - nfluencer",
              html: `<p>Hi ${content.username},</p>
                     <p>Your content "${content.title}" has been removed.</p>
                     <p>Reason: ${reason || "Violation of community guidelines"}</p>`,
            },
            c.env.RESEND_API_KEY
          );
        } catch (err) {
          console.error("[moderate-content] Email error:", err);
        }
      })()
    );
  }

  return corsJson(c, { success: true, message: `Content ${actionType}ed successfully` });
});
