/**
 * admin-service/src/routes/delete-user.ts
 *
 * POST /api/v1/admin/delete-user
 * Permanently deletes a user, their content, relationships, and R2 assets.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const deleteUserRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

deleteUserRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const body = await c.req.json<{ userId?: number; reason?: string }>();
  const { userId, reason } = body;

  if (!userId) return corsJson(c, { error: "User ID is required" }, 400);

  const userToDelete = await c.env.DB
    .prepare("SELECT id, username, email, display_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: number; username: string; email: string; display_name: string }>();

  if (!userToDelete) return corsJson(c, { error: "User not found" }, 404);
  if (userId === user.id) return corsJson(c, { error: "Cannot delete your own account" }, 400);

  // Audit log before deletion
  await c.env.DB
    .prepare(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'user_deleted', 'user', ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(
      user.id,
      userId,
      JSON.stringify({
        username: userToDelete.username,
        email: userToDelete.email,
        reason: reason || "Deleted by admin",
      })
    )
    .run();

  try {
    // Delete content files from R2
    const userContent = await c.env.DB
      .prepare("SELECT id, url, thumbnail_url FROM content WHERE creator_id = ?")
      .bind(userId)
      .all<{ id: number; url: string | null; thumbnail_url: string | null }>();

    for (const content of userContent.results ?? []) {
      for (const rawUrl of [content.url, content.thumbnail_url]) {
        if (!rawUrl) continue;
        try {
          const urlParts = rawUrl.split("/");
          const keyStart = urlParts.findIndex((p) => p === "content");
          if (keyStart !== -1) {
            const r2Key = urlParts.slice(keyStart).join("/");
            await c.env.STORAGE.delete(r2Key);
          }
        } catch {
          // Non-fatal — continue with DB deletion
        }
      }
      await c.env.DB.prepare("DELETE FROM content WHERE id = ?").bind(content.id).run();
    }

    // Cascade-delete relationships
    await c.env.DB.prepare("DELETE FROM followers WHERE follower_id = ? OR following_id = ?").bind(userId, userId).run();
    await c.env.DB.prepare("DELETE FROM subscriptions WHERE subscriber_id = ? OR creator_id = ?").bind(userId, userId).run();
    await c.env.DB.prepare("DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?").bind(userId, userId).run();
    await c.env.DB.prepare("DELETE FROM reports WHERE reporter_id = ? OR reported_user_id = ?").bind(userId, userId).run();

    // Tombstone the username
    if (userToDelete.username) {
      await c.env.DB
        .prepare("INSERT OR IGNORE INTO reserved_usernames (username) VALUES (?)")
        .bind(userToDelete.username)
        .run();
    }

    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

    return corsJson(c, {
      success: true,
      message: `User ${userToDelete.username} has been permanently deleted`,
    });
  } catch (error) {
    console.error("[delete-user] Error:", error);
    return corsJson(c, { error: "Failed to delete user" }, 500);
  }
});
