/**
 * admin-service/src/routes/promote-user.ts
 *
 * POST /api/v1/admin/promote-user
 * Grants or revokes admin/creator status for a user by username.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const promoteUserRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

promoteUserRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);

  const body = await c.req.json<{
    username?: string;
    role?: string;
    isCreator?: boolean;
    is_creator_mode?: boolean;
  }>();
  const { username, role = "admin", isCreator, is_creator_mode: isCreatorMode } = body;
  const creatorFlag = isCreatorMode ?? isCreator ?? false;

  if (!username) return corsJson(c, { error: "Username required" }, 400);

  const userToPromote = await c.env.DB
    .prepare("SELECT id, username, email, display_name FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: number; username: string; email: string; display_name: string }>();

  if (!userToPromote) return corsJson(c, { error: "User not found" }, 404);

  const makeAdmin = role === "admin";
  await c.env.DB
    .prepare("UPDATE users SET is_admin = ?, is_creator_mode = ? WHERE id = ?")
    .bind(makeAdmin ? 1 : 0, creatorFlag ? 1 : 0, userToPromote.id)
    .run();

  return corsJson(c, {
    success: true,
    message: `User @${username} promoted to ${role}${creatorFlag ? " and creator mode enabled" : ""}`,
    user: {
      id: userToPromote.id,
      username: userToPromote.username,
      email: userToPromote.email,
      display_name: userToPromote.display_name,
      is_admin: makeAdmin ? 1 : 0,
      is_creator_mode: creatorFlag,
    },
  });
});
