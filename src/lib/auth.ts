/**
 * admin-service/src/lib/auth.ts
 *
 * Clerk authentication middleware for the admin Hono microservice.
 * Verifies the Clerk session token and loads the user row from D1.
 * Adapted from app/lib/clerk-loader-utils.server.ts in the main app.
 */

import { createClerkClient } from "@clerk/backend";
import type { Context, Next } from "hono";
import type { Env } from "../types";

export type AdminUser = {
  id: number;
  clerk_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: number;
  admin_role?: string;
};

/** Extract verified Clerk user ID from the request session token */
async function getClerkUserIdFromRequest(request: Request, env: Env): Promise<string | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), 4000);
  });

  try {
    return await Promise.race([_doClerkAuth(request, env), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function _doClerkAuth(request: Request, env: Env): Promise<string | null> {
  try {
    const secretKey = env.CLERK_SECRET_KEY;
    const publishableKey = env.VITE_CLERK_PUBLISHABLE_KEY;

    if (!secretKey) return null;

    const clerkClient = createClerkClient({ secretKey, publishableKey });
    const requestOrigin = new URL(request.url).origin;
    const authorizedParties = [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:8787",
      "http://localhost:5175",
      requestOrigin,
      "https://nfluencer.co",
      "https://www.nfluencer.co",
      "https://dashboard.nfluencer.co",
    ];

    const requestState = await clerkClient.authenticateRequest(request, { authorizedParties });
    const auth = requestState.toAuth();

    if (!auth || !auth.userId) return null;
    return auth.userId;
  } catch {
    return null;
  }
}

/** Look up the D1 user row for a given Clerk user ID */
async function getUserFromDb(clerkId: string, db: D1Database): Promise<AdminUser | null> {
  try {
    const user = await db
      .prepare(
        `SELECT id, clerk_id, email, username, display_name, avatar_url, is_admin, admin_role
         FROM users WHERE clerk_id = ? LIMIT 1`
      )
      .bind(clerkId)
      .first<AdminUser>();
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * Hono middleware: authenticates the request and injects `adminUser` into
 * the context variable. Returns 401 if unauthenticated, 403 if not an admin.
 */
export async function requireAdmin(
  c: Context<{ Bindings: Env; Variables: { adminUser: AdminUser } }>,
  next: Next
): Promise<Response | void> {
  const clerkId = await getClerkUserIdFromRequest(c.req.raw, c.env);
  if (!clerkId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await getUserFromDb(clerkId, c.env.DB);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  if (!user.is_admin) {
    return c.json({ error: "Forbidden — admin role required" }, 403);
  }

  c.set("adminUser", user);
  await next();
}

/** Lightweight auth helper for individual route handlers (no next()) */
export async function authenticate(
  request: Request,
  env: Env
): Promise<{ user: AdminUser } | { error: string; status: 401 | 403 | 404 }> {
  const clerkId = await getClerkUserIdFromRequest(request, env);
  if (!clerkId) {
    return { error: "Unauthorized", status: 401 };
  }

  const user = await getUserFromDb(clerkId, env.DB);
  if (!user) {
    return { error: "User not found", status: 404 };
  }
  if (!user.is_admin) {
    return { error: "Forbidden — admin role required", status: 403 };
  }

  return { user };
}
