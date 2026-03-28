/**
 * admin-service/src/routes/me.ts
 *
 * GET /api/v1/admin/me
 * Returns the identity of the currently authenticated admin user.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const meRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

meRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);

  if ("error" in auth) {
    // Return is_admin: false rather than an error so the dashboard can check gracefully
    return corsJson(c, { is_admin: false });
  }

  const { user } = auth;

  return corsJson(c, {
    is_admin: true,
    id: user.id,
    email: user.email || "",
    username: user.username || "",
    display_name: user.display_name || "",
    avatar_url: user.avatar_url || "",
  });
});
