/**
 * admin-service/src/routes/search.ts
 *
 * GET /api/v1/admin/search?q=<query>&limit=<n>
 * Global search across users, creators, and content.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, safeAll, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const searchRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

searchRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const url = new URL(c.req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(getNumber(url.searchParams.get("limit"), 5), 20);

  if (q.length < 2) return corsJson(c, { users: [], creators: [], content: [] });

  const pattern = `%${q}%`;
  const db = c.env.DB;

  const [users, creators, content] = await Promise.all([
    safeAll<{ id: number; name: string; email: string; role: string }>(
      db,
      `SELECT id,
              COALESCE(display_name, username, email, '') as name,
              COALESCE(email, '') as email,
              CASE WHEN is_admin = 1 THEN 'admin'
                   WHEN is_creator_mode = 1 THEN 'creator'
                   ELSE 'user' END as role
       FROM users
       WHERE display_name LIKE ? OR username LIKE ? OR email LIKE ?
       LIMIT ?`,
      [pattern, pattern, pattern, limit]
    ),
    safeAll<{ id: number; name: string; email: string }>(
      db,
      `SELECT id,
              COALESCE(display_name, username, email, '') as name,
              COALESCE(email, '') as email
       FROM users
       WHERE (is_creator_mode = 1 OR kyc_status = 'verified')
         AND (display_name LIKE ? OR username LIKE ? OR email LIKE ?)
       LIMIT ?`,
      [pattern, pattern, pattern, limit]
    ),
    safeAll<{ id: number; title: string; type: string; creator: string }>(
      db,
      `SELECT c.id, COALESCE(c.title, 'Untitled') as title,
              COALESCE(c.type, 'post') as type,
              COALESCE(u.display_name, u.username, 'Unknown') as creator
       FROM content c
       LEFT JOIN users u ON c.creator_id = u.id
       WHERE c.title LIKE ? OR u.display_name LIKE ? OR u.username LIKE ?
       LIMIT ?`,
      [pattern, pattern, pattern, limit]
    ),
  ]);

  return corsJson(c, { users, creators, content });
});
