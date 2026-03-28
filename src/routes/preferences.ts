/**
 * admin-service/src/routes/preferences.ts
 *
 * GET  /api/v1/admin/preferences   — Load saved filters + SLA config for the current admin
 * POST /api/v1/admin/preferences   — Create / update / delete a saved filter preset
 */

import { Hono } from "hono";
import type { Env } from "../types";
import type { AdminUser } from "../lib/auth";
import { authenticate } from "../lib/auth";
import { corsJson, safeAll } from "../lib/utils";

type Variables = { adminUser: AdminUser };

export const preferencesRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

preferencesRoute.get("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const page = new URL(c.req.url).searchParams.get("page") || null;

  const filters = await safeAll<{
    id: number;
    page: string;
    name: string;
    filter_json: string;
    is_default: number;
    created_at: string;
  }>(
    c.env.DB,
    page
      ? "SELECT id, page, name, filter_json, is_default, created_at FROM admin_saved_filters WHERE user_id = ? AND page = ? ORDER BY is_default DESC, name ASC"
      : "SELECT id, page, name, filter_json, is_default, created_at FROM admin_saved_filters WHERE user_id = ? ORDER BY page ASC, is_default DESC, name ASC",
    page ? [user.id, page] : [user.id]
  );

  const slaConfig = await safeAll<{
    severity: string;
    target_hours: number;
    warning_hours: number;
  }>(c.env.DB, "SELECT severity, target_hours, warning_hours FROM admin_sla_config ORDER BY target_hours ASC");

  return corsJson(c, {
    filters: filters.map((f) => ({
      id: f.id,
      page: f.page,
      name: f.name,
      filterJson: f.filter_json,
      isDefault: Boolean(f.is_default),
      createdAt: f.created_at,
    })),
    slaConfig,
    adminRole: (user as { admin_role?: string }).admin_role ?? "super_admin",
  });
});

preferencesRoute.post("/", async (c) => {
  const auth = await authenticate(c.req.raw, c.env);
  if ("error" in auth) return corsJson(c, { error: auth.error }, auth.status as any);
  const { user } = auth;

  const body = await c.req.json<{
    page: string;
    name: string;
    filter_json: string;
    is_default?: boolean;
    id?: number;
    _delete?: boolean;
  }>();

  if (body._delete && body.id) {
    await c.env.DB
      .prepare("DELETE FROM admin_saved_filters WHERE id = ? AND user_id = ?")
      .bind(body.id, user.id)
      .run();
    return corsJson(c, { ok: true });
  }

  if (body.id) {
    await c.env.DB
      .prepare("UPDATE admin_saved_filters SET name=?, filter_json=?, is_default=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?")
      .bind(body.name, body.filter_json, body.is_default ? 1 : 0, body.id, user.id)
      .run();
    return corsJson(c, { ok: true });
  }

  const result = await c.env.DB
    .prepare("INSERT INTO admin_saved_filters (user_id, page, name, filter_json, is_default) VALUES (?,?,?,?,?)")
    .bind(user.id, body.page, body.name, body.filter_json, body.is_default ? 1 : 0)
    .run();

  return corsJson(c, { ok: true, id: result.meta?.last_row_id ?? null });
});
