// Hono route handler for /api/v1/admin/verify-creator
// Approves or rejects a creator verification request and sends notification emails.

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, sendEmail } from "../lib/utils";

type Variables = { adminUser: AdminUser };
export const verifyCreatorRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

verifyCreatorRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const adminUser = auth.user;

  let body: { creatorId?: number; approved?: boolean; reason?: string };
  try {
    body = await c.req.json();
  } catch {
    return corsJson(c, { error: "Invalid JSON body" }, 400);
  }

  const { creatorId, approved, reason = "" } = body;

  if (!creatorId) {
    return corsJson(c, { error: "Creator ID required" }, 400);
  }

  const db = c.env.DB;

  const creator = await db
    .prepare("SELECT id, username, email, display_name FROM users WHERE id = ?")
    .bind(creatorId)
    .first<{ id: number; username: string; email: string; display_name: string | null }>();

  if (!creator) {
    return corsJson(c, { error: "Creator not found" }, 404);
  }

  if (approved) {
    await db
      .prepare("UPDATE users SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(creatorId)
      .run();

    await db
      .prepare(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, target_username, details, created_at)
         VALUES (?, 'creator_verified', 'creator', ?, ?, 'Creator verified and approved', CURRENT_TIMESTAMP)`
      )
      .bind(adminUser.id, creatorId, creator.username)
      .run();

    // Fire-and-forget approval email
    c.executionCtx.waitUntil(
      sendEmail({
        to: c.env.ENVIRONMENT === "production" ? creator.email : "onboarding@resend.dev",
        subject: "🎉 You're now a verified creator on nfluencer!",
        html: `<p>Hi ${creator.display_name || creator.username},</p>
               <p>Congratulations! Your creator account has been verified on nfluencer.</p>
               <p>You can now access all creator features.</p>`,
      }, c.env.RESEND_API_KEY).then(async (result) => {
        await db
          .prepare(
            `INSERT INTO email_logs (recipient_id, recipient_email, email_type, subject, status, metadata, created_at)
             VALUES (?, ?, 'verification_complete', 'Your creator account has been verified!', ?, ?, CURRENT_TIMESTAMP)`
          )
          .bind(
            creatorId,
            creator.email,
            result.success ? "sent" : "failed",
            JSON.stringify({ status: "approved", messageId: result.messageId })
          )
          .run();
      }).catch((err) => console.error("[verify-creator] email error:", err))
    );

    return corsJson(c, { success: true, message: `Creator ${creator.username} verified` });
  } else {
    await db
      .prepare("UPDATE users SET verified = 0, verified_at = NULL WHERE id = ?")
      .bind(creatorId)
      .run();

    await db
      .prepare(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, target_username, details, created_at)
         VALUES (?, 'creator_rejected', 'creator', ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(adminUser.id, creatorId, creator.username, reason)
      .run();

    // Fire-and-forget rejection email
    c.executionCtx.waitUntil(
      sendEmail({
        to: c.env.ENVIRONMENT === "production" ? creator.email : "onboarding@resend.dev",
        subject: "Update on your creator verification - nfluencer",
        html: `<p>Hi ${creator.display_name || creator.username},</p>
               <p>Unfortunately, your creator verification was not approved at this time.</p>
               ${reason ? `<p>Reason: ${reason}</p>` : ""}
               <p>Please contact support if you have questions.</p>`,
      }, c.env.RESEND_API_KEY).then(async (result) => {
        await db
          .prepare(
            `INSERT INTO email_logs (recipient_id, recipient_email, email_type, subject, status, metadata, created_at)
             VALUES (?, ?, 'creator_rejected', 'Your creator verification was not approved', ?, ?, CURRENT_TIMESTAMP)`
          )
          .bind(
            creatorId,
            creator.email,
            result.success ? "sent" : "failed",
            JSON.stringify({ status: "rejected", reason, messageId: result.messageId })
          )
          .run();
      }).catch((err) => console.error("[verify-creator] email error:", err))
    );

    return corsJson(c, {
      success: true,
      message: `Creator ${creator.username} verification rejected`,
    });
  }
});
