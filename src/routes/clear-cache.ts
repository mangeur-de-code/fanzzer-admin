/**
 * admin-service/src/routes/clear-cache.ts
 *
 * POST /api/v1/admin/clear-cache
 * Deletes all entries from the KV namespace (platform cache).
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const clearCacheRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

clearCacheRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  try {
    const kv = c.env.KV;
    if (!kv) return corsJson(c, { error: "KV namespace not available" }, 500);

    let totalDeleted = 0;
    let cursor: string | undefined;

    do {
      const listResult = await kv.list({ cursor, limit: 1000 });
      const keys = listResult.keys.map((k: { name: string }) => k.name);

      if (keys.length > 0) {
        await Promise.all(keys.map((key: string) => kv.delete(key)));
        totalDeleted += keys.length;
      }

      cursor = listResult.list_complete ? undefined : (listResult as any).cursor;
    } while (cursor);

    await c.env.DB
      .prepare(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
         VALUES (?, 'cache_cleared', 'platform', 0, ?, CURRENT_TIMESTAMP)`
      )
      .bind(user.id, JSON.stringify({ keysDeleted: totalDeleted }))
      .run();

    return corsJson(c, {
      success: true,
      message: `Cache cleared — ${totalDeleted} entries removed`,
      keysDeleted: totalDeleted,
    });
  } catch (error) {
    console.error("[clear-cache] Error:", error);
    return corsJson(c, { error: "Failed to clear cache" }, 500);
  }
});
