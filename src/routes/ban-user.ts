/**
 * admin-service/src/routes/ban-user.ts
 *
 * POST /api/v1/admin/ban-user
 * Bans a user temporarily or permanently and sends a notification email.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, sendEmail } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const banUserRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

banUserRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const body = await c.req.json<{
    userId?: number;
    duration?: "permanent" | "temporary";
    days?: number;
    reason?: string;
  }>();
  const { userId, duration = "permanent", days = 30, reason = "" } = body;

  if (!userId) return corsJson(c, { error: "User ID required" }, 400);

  const userToBan = await c.env.DB
    .prepare("SELECT id, username, email, display_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: number; username: string; email: string; display_name: string }>();

  if (!userToBan) return corsJson(c, { error: "User not found" }, 404);

  const bannedUntil =
    duration === "temporary"
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : null;

  await c.env.DB
    .prepare("UPDATE users SET role = 'banned', banned_until = ?, banned_reason = ? WHERE id = ?")
    .bind(bannedUntil, reason, userId)
    .run();

  await c.env.DB
    .prepare(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, target_username, details, created_at)
       VALUES (?, 'user_banned', 'user', ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(user.id, userId, userToBan.username, reason)
    .run();

  // Fire-and-forget email notification
  c.executionCtx.waitUntil(
    sendEmail(
      {
        to: c.env.ENVIRONMENT === "production" ? userToBan.email : "onboarding@resend.dev",
        subject: "Your account has been suspended - nfluencer",
        html: `<p>Hi ${userToBan.display_name || userToBan.username},</p>
               <p>Your account has been suspended${duration === "temporary" ? ` for ${days} days` : " permanently"}.</p>
               <p>Reason: ${reason || "Violation of community guidelines"}</p>`,
      },
      c.env.RESEND_API_KEY
    )
  );

  return corsJson(c, { success: true, message: `User ${userToBan.username} has been banned` });
});
