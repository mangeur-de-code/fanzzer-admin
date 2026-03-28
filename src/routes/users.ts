// Hono route handler for /api/v1/admin/users
// Returns a paginated list of all users with follower, subscriber, and spend counts.

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, getDateRange, safeAll, getNumber } from "../lib/utils";

type Variables = { adminUser: AdminUser };
export const usersRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

usersRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const range = getDateRange(c.req.raw, 30);
  const db = c.env.DB;

  const rows = await safeAll<{
    id: number;
    name: string;
    email: string;
    is_admin: number;
    created_at: string;
    followers: number;
    subscribers: number;
    total_spend: number;
  }>(
    db,
    `SELECT
       u.id,
       COALESCE(u.display_name, u.username, u.email) as name,
       u.email,
       u.is_admin,
       u.created_at,
       (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) as followers,
       (SELECT COUNT(*) FROM subscriptions s WHERE s.creator_id = u.id AND s.status = 'active') as subscribers,
       (SELECT COALESCE(SUM(amount), 0) FROM balance_transactions bt WHERE bt.user_id = u.id AND bt.type IN ('fund', 'charge')) as total_spend
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT 200`
  );

  const users = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.is_admin ? "admin" : "user",
    createdAt: row.created_at,
    followers: getNumber(row.followers),
    subscribers: getNumber(row.subscribers),
    totalSpend: getNumber(row.total_spend),
    status: row.is_admin ? "admin" : "active",
  }));

  return corsJson(c, { range, users });
});
